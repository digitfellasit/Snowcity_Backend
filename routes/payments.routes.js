const express = require('express');
const router = express.Router();

const { pool } = require('../config/db');
const payphi = require('../config/payphi');
const createHttpClient = require('../config/axios');

const isTrue = (v) => ['1', 'true', 'yes', 'on'].includes(String(v || '').toLowerCase());

async function shallowPing(baseURL) {
  try {
    const http = createHttpClient({ baseURL, timeout: 4000 });
    const resp = await http.get('/', { validateStatus: () => true });
    return { reachable: true, status: resp.status };
  } catch (e) {
    return { reachable: false, error: e.message };
  }
}

// GET /api/payments/health
router.get('/health', async (req, res) => {
  try {
    let dbOk = false;
    try { await pool.query('SELECT 1'); dbOk = true; } catch { }

    const payphiConfigured = !!(process.env.PAYPHI_MERCHANT_ID && process.env.PAYPHI_SECRET_KEY);
    const phonepeConfigured = !!(process.env.PHONEPE_CLIENT_ID && process.env.PHONEPE_CLIENT_SECRET);

    let payphiSampleHash = null;
    if (payphiConfigured) {
      const payload = {
        addlParam1: 'Test1',
        addlParam2: 'Test2',
        amount: '300.00',
        currencyCode: '356',
        customerEmailID: 'test@gmail.com',
        customerMobileNo: '917498791441',
        merchantId: process.env.PAYPHI_MERCHANT_ID,
        merchantTxnNo: `HEALTH${Date.now()}`,
        payType: '0',
        returnURL: process.env.PAYPHI_RETURN_URL || '',
        transactionType: 'SALE',
        txnDate: payphi.formatTxnDate(),
      };
      payphiSampleHash = payphi.computeInitiateHash(payload);
    }

    const doDeep = isTrue(process.env.PAYMENTS_DEEP_CHECK);
    const payphiReachability = payphiConfigured && doDeep
      ? await shallowPing((process.env.PAYPHI_BASE_URL || '').replace(/\/+$/, ''))
      : null;

    res.json({
      ok: dbOk && (payphiConfigured || phonepeConfigured),
      db: { ok: dbOk },
      payphi: {
        configured: payphiConfigured,
        baseURL: process.env.PAYPHI_BASE_URL || null,
        merchantId: process.env.PAYPHI_MERCHANT_ID ? '***' + String(process.env.PAYPHI_MERCHANT_ID).slice(-4) : null,
        returnURL: process.env.PAYPHI_RETURN_URL || null,
        sampleHash: payphiSampleHash,
        reachability: payphiReachability,
      },
      phonepe: {
        configured: phonepeConfigured,
        environment: process.env.PHONEPE_ENVIRONMENT || 'sandbox',
        baseURL: process.env.PHONEPE_ENVIRONMENT === 'production'
          ? process.env.PHONEPE_BASE_URL_PRODUCTION
          : process.env.PHONEPE_BASE_URL_SANDBOX,
        clientId: process.env.PHONEPE_CLIENT_ID ? '***' + String(process.env.PHONEPE_CLIENT_ID).slice(-4) : null,
        callbackURL: process.env.PHONEPE_CALLBACK_URL || null,
      },
      notes: doDeep ? 'Deep checks enabled' : 'Set PAYMENTS_DEEP_CHECK=true to ping base URL',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/payments/payphi/hash-preview
router.post('/payphi/hash-preview', express.json(), (req, res) => {
  try {
    const p = req.body || {};
    if (!p.txnDate) p.txnDate = payphi.formatTxnDate();
    const hashText = payphi.buildCanonicalConcatString(p);
    const computedSecureHash = payphi.computeInitiateHash(p);
    res.json({
      note: 'secureHash = HMAC-SHA256(hashText, secret), lowercase hex; hashText is ascending concat of non-empty params',
      keys: Object.keys(p).sort(),
      hashText,
      computedSecureHash,
      payloadEcho: p,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Include PhonePe routes
router.use('/phonepe', require('./phonepe.routes'));

// ✅ Public: PayPhi status check by tranCtx/txnId — NO AUTH required
// Called by frontend PaymentStatus page after PayPhi redirects back to snowcityblr.com
router.get('/payphi/status/txn/:txnId', async (req, res) => {
  try {
    const { txnId } = req.params;
    if (!txnId || !txnId.trim()) {
      return res.status(400).json({ success: false, error: 'txnId is required' });
    }

    const { pool: db } = require('../config/db');
    const bookingService = require('../services/bookingService');

    // Find order by PayPhi tranCtx (stored as payment_ref) or order_ref
    const q = await db.query(
      `SELECT order_id, order_ref, payment_status
       FROM orders
       WHERE payment_ref = $1 OR order_ref = $1
       LIMIT 1`,
      [txnId.trim()]
    );
    const order = q.rows[0] || null;

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found for this transaction ID' });
    }

    // Already paid — return success immediately
    if (order.payment_status === 'Completed') {
      const bookingRes = await db.query(
        `SELECT booking_id, ticket_pdf FROM bookings
         WHERE order_id = $1 AND ticket_pdf IS NOT NULL
         ORDER BY booking_id ASC LIMIT 1`,
        [order.order_id]
      );
      const firstBooking = bookingRes.rows[0];
      return res.json({
        success: true,
        alreadyPaid: true,
        status: 'COMPLETED',
        orderId: order.order_id,
        orderRef: order.order_ref,
        bookingId: firstBooking?.booking_id || null,
        ticketUrl: firstBooking?.ticket_pdf || null,
      });
    }

    // Check with PayPhi API
    let statusResult;
    try {
      statusResult = await bookingService.checkPayPhiStatus(order.order_id);
    } catch (svcErr) {
      return res.status(502).json({
        success: false,
        error: 'Payment verification failed. Please contact support.',
      });
    }

    const paid = statusResult.success;
    if (!paid) {
      const status = statusResult.status || 'PENDING';
      return res.json({
        success: false,
        status,
        orderId: order.order_id,
        orderRef: order.order_ref,
        message: status === 'FAILED'
          ? 'Payment failed or was declined. Please try again.'
          : 'Payment not yet completed',
      });
    }

    const bookingRes = await db.query(
      `SELECT booking_id, ticket_pdf FROM bookings
       WHERE order_id = $1
       ORDER BY booking_id ASC LIMIT 1`,
      [order.order_id]
    );
    const firstBooking = bookingRes.rows[0];

    return res.json({
      success: true,
      status: 'COMPLETED',
      orderId: order.order_id,
      orderRef: order.order_ref,
      bookingId: firstBooking?.booking_id || null,
      ticketUrl: firstBooking?.ticket_pdf || null,
    });

  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error during payment verification' });
  }
});

module.exports = router;