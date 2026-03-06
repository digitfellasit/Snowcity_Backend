const logger = require('../config/logger');
const { pool } = require('../config/db');
const bookingService = require('../services/bookingService');

const pickTranCtx = (payload = {}) => {
  const entries = Object.entries(payload || {});
  for (const [key, value] of entries) {
    if (!key) continue;
    if (key.toLowerCase() === 'tranctx') {
      const val = String(value || '').trim();
      if (val) return val;
    }
  }
  return '';
};

const pickValue = (payload = {}, target = '') => {
  if (!target) return undefined;
  const t = target.toLowerCase();
  for (const [key, value] of Object.entries(payload || {})) {
    if ((key || '').toLowerCase() === t) return value;
  }
  return undefined;
};

const resolveClientBaseUrl = () => {
  const raw = process.env.FRONTEND_URL || process.env.CLIENT_URL || '';
  const entries = raw
    .split(',')
    .map((val) => String(val || '').trim())
    .filter(Boolean);
  const fallback = 'https://snowcity.vercel.app';
  const base = entries[0] || fallback;
  return base.replace(/\/$/, '');
};

const resolveAppBaseUrl = () => {
  const raw = process.env.APP_URL || '';
  const entries = raw
    .split(',')
    .map((val) => String(val || '').trim())
    .filter(Boolean);
  const fallback = process.env.APP_PUBLIC_URL || 'https://app.snowcityblr.com';
  const base = entries[0] || fallback;
  return base.replace(/\/$/, '');
};

const absoluteFromPath = (path = '') => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = resolveAppBaseUrl();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
};

module.exports = async (req, res) => {
  try {
    const tranCtx = pickTranCtx(req.query) || pickTranCtx(req.body);
    const merchantTxnNo =
      pickValue(req.query, 'merchantTxnNo') ||
      pickValue(req.body, 'merchantTxnNo') ||
      pickValue(req.query, 'merchantTxnno') ||
      pickValue(req.body, 'merchantTxnno');
    const addlParam1 = pickValue(req.query, 'addlParam1') || pickValue(req.body, 'addlParam1');

    if (!tranCtx && !merchantTxnNo && !addlParam1) {
      logger.warn('PayPhi return: Missing identifiers (tranCtx, merchantTxnNo, addlParam1)');
      return res.status(400).send('Missing identifiers');
    }

    // 1. Find the Order associated with this payment reference
    let order = null;

    // A. By addlParam1 (Order ID) - Most reliable if present
    if (addlParam1 && !isNaN(parseInt(addlParam1))) {
      const q = await pool.query(
        `SELECT order_id, order_ref, payment_status
         FROM orders
         WHERE order_id = $1
         LIMIT 1`,
        [parseInt(addlParam1)]
      );
      order = q.rows[0] || null;
    }

    // B. By tranCtx - Stored in orders.payment_ref during initiate
    if (!order && tranCtx) {
      const q = await pool.query(
        `SELECT order_id, order_ref, payment_status
         FROM orders
         WHERE payment_ref = $1
         LIMIT 1`,
        [tranCtx]
      );
      order = q.rows[0] || null;
    }

    // C. By merchantTxnNo - Fallback
    if (!order && merchantTxnNo) {
      // First try exact match with order_ref
      const byRef = await pool.query(
        `SELECT order_id, order_ref, payment_status
         FROM orders
         WHERE order_ref = $1
         LIMIT 1`,
        [merchantTxnNo]
      );
      order = byRef.rows[0] || null;

      if (!order && merchantTxnNo.includes('_')) {
        // Try exact match with payment_txn_no (if we started storing it)
        const byTxnNo = await pool.query(
          `SELECT order_id, order_ref, payment_status
           FROM orders
           WHERE payment_txn_no = $1
           LIMIT 1`,
          [merchantTxnNo]
        );
        order = byTxnNo.rows[0] || null;
      }
    }

    if (!order) {
      logger.warn('PayPhi return: Order not found for identifiers', { tranCtx, merchantTxnNo, addlParam1 });
      return res.redirect(`${process.env.CLIENT_URL || ''}/payment/return?status=failed&reason=not_found`);
    }

    // 2. Trigger the Service Logic
    // This handles: API check, DB Updates (Order + Bookings), Ticket Generation, Emailing
    let success = false;
    let paymentStatus = null;
    try {
      const statusResult = await bookingService.checkPayPhiStatus(order.order_id);
      success = statusResult.success;
      paymentStatus = statusResult.status || 'unknown';
      logger.info('PayPhi return: Check status complete', { order_id: order.order_id, success, paymentStatus });

      // If payment status is explicitly failed, cancelled, or declined, treat as failed
      if (['failed', 'cancelled', 'declined', 'error'].includes(paymentStatus?.toLowerCase())) {
        success = false;
      }
    } catch (svcErr) {
      logger.error('PayPhi return: Service verification failed', { err: svcErr.message });
      // If service fails to check status, assume payment is incomplete/failed
      success = false;
    }

    // 3. Redirect to frontend PaymentStatus page (same flow as PhonePe)
    // The frontend page will call GET /api/payments/payphi/status/txn/:txnId
    // to verify payment + update DB + generate tickets via bookingService.checkPayPhiStatus
    const prefix = resolveClientBaseUrl();
    const txnParam = order?.order_ref || merchantTxnNo || tranCtx || '';
    const redirectUrl = `${prefix}/payment-status?gateway=payphi&txnId=${encodeURIComponent(txnParam)}`;

    logger.info('PayPhi return: Redirecting to payment-status page', {
      order_id: order?.order_id,
      txnParam,
      paymentSuccess: success,
      redirectUrl,
    });

    return res.redirect(redirectUrl);

  } catch (err) {
    logger.error('PayPhi return error', { err: err.message });
    const prefix = resolveClientBaseUrl();
    return res.redirect(`${prefix}/payment-status?gateway=payphi&status=error`);
  }
};