const logger = require('../config/logger');
const { pool } = require('../config/db');
const phonepeController = require('../controllers/phonepe.controller');

const pickMerchantTxnId = (payload = {}) => {
    const entries = Object.entries(payload || {});
    for (const [key, value] of entries) {
        if (!key) continue;
        const k = key.toLowerCase();
        if (k === 'merchanttransactionid' || k === 'transactionid' || k === 'merchantorderid' || k === 'orderid' || k === 'id') {
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
    const raw = process.env.CLIENT_URL || '';
    const entries = raw
        .split(',')
        .map((val) => String(val || '').trim())
        .filter(Boolean);
    const fallback = process.env.NODE_ENV === 'production'
        ? 'https://snowpark.netlify.app'
        : 'https://snowpark.netlify.app';
    const base = entries[0] || fallback;
    return base.replace(/\/$/, '');
};

const resolveAppBaseUrl = () => {
    const raw = process.env.APP_URL || '';
    const entries = raw
        .split(',')
        .map((val) => String(val || '').trim())
        .filter(Boolean);
    const fallback = process.env.APP_PUBLIC_URL || 'https://snowpark.netlify.app';
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
        const merchantTxnId = pickMerchantTxnId(req.query) || pickMerchantTxnId(req.body);
        const orderRefRaw = pickValue(req.query, 'order') || pickValue(req.body, 'order') || pickValue(req.query, 'orderId') || pickValue(req.body, 'orderId');
        const orderRef = orderRefRaw ? String(orderRefRaw).trim() : '';
        const code = pickValue(req.query, 'code') || pickValue(req.body, 'code');

        logger.info('PhonePe return received', { merchantTxnId, orderRef, code });

        if (!merchantTxnId && !orderRef) {
            logger.warn('PhonePe return: Missing merchantTransactionId and order ref');
            return res.status(400).send('Missing transaction reference');
        }

        // For PhonePe Standard Checkout API, redirect based on code
        if (code) {
            const prefix = resolveClientBaseUrl();
            const status = code === 'PAYMENT_SUCCESS' ? 'success' : 'failed';

            let redirectUrl = `${prefix}/payment/${status}?orderId=${merchantTxnId || orderRef}`;

            if (code !== 'PAYMENT_SUCCESS') {
                redirectUrl += `&code=${code}`;
            }

            logger.info('PhonePe return: Redirecting based on code', { code, redirectUrl });
            return res.redirect(redirectUrl);
        }

        // Fallback to existing logic for backward compatibility
        let order = null;

        if (merchantTxnId) {
            const q = await pool.query(
                `SELECT order_id, order_ref, payment_status
         FROM orders
         WHERE payment_ref = $1 OR order_ref = $1
         LIMIT 1`,
                [merchantTxnId]
            );
            order = q.rows[0] || null;
        }

        if (!order && orderRef) {
            const byRef = await pool.query(
                `SELECT order_id, order_ref, payment_status
         FROM orders
         WHERE order_ref = $1
         LIMIT 1`,
                [orderRef]
            );
            order = byRef.rows[0] || null;
        }

        if (!order) {
            logger.warn('PhonePe return: Order not found', { merchantTxnId, orderRef });
            return res.redirect(`${resolveClientBaseUrl()}/payment/return?status=failed&reason=not_found`);
        }

        // Use bookingService to check status (validates against PhonePe API + updates DB + sends tickets)
        let success = false;
        let paymentStatus = null;
        try {
            // checkPhonePeStatus validates payment, updates DB, generates tickets, sends emails
            const statusResult = await bookingService.checkPhonePeStatus(order.order_id);

            // If it returns, it means success (or at least valid response). 
            // checkPhonePeStatus returns { success: true, data: ..., status: ... }
            success = statusResult.success && (statusResult.status === 'completed' || statusResult.status === 'COMPLETED');
            paymentStatus = statusResult.status || 'unknown';

            logger.info('PhonePe return: Check status complete via bookingService', {
                order_id: order.order_id,
                success,
                paymentStatus
            });

        } catch (svcErr) {
            logger.error('PhonePe return: Service verification failed', { err: svcErr.message });
            // checkPhonePeStatus throws if status check fails or payment not success
            success = false;
            paymentStatus = 'failed';
        }

        // Redirect to Client
        const prefix = resolveClientBaseUrl();

        if (!success) {
            const failedUrl = `${prefix}/payment/return?order=${encodeURIComponent(orderRef)}&status=failed&reason=payment_failed&gateway=phonepe`;
            logger.warn('PhonePe return: Payment failed or incomplete, redirecting to failed page', {
                order_id: order?.order_id,
                payment_status: paymentStatus,
                success
            });
            return res.redirect(failedUrl);
        }

        // Success case - proceed with success redirect
        let primaryBookingId = null;
        let ticketPath = null;
        try {
            const bookingRef = await pool.query(
                `SELECT b1.booking_id, COALESCE(b1.ticket_pdf, (SELECT b2.ticket_pdf FROM bookings b2 WHERE b2.order_id = $1 AND b2.ticket_pdf IS NOT NULL ORDER BY b2.booking_id ASC LIMIT 1)) as ticket_pdf
           FROM bookings b1
           WHERE b1.order_id = $1
           ORDER BY b1.booking_id ASC
           LIMIT 1`,
                [order.order_id]
            );
            const firstBooking = bookingRef.rows[0];
            primaryBookingId = firstBooking?.booking_id || null;
            ticketPath = firstBooking?.ticket_pdf || null;
        } catch (lookupErr) {
            logger.warn('PhonePe return: Failed to fetch primary booking for success redirect', { err: lookupErr.message });
        }

        const params = new URLSearchParams();
        if (primaryBookingId) params.set('booking', primaryBookingId);
        params.set('cart', orderRef);
        if (merchantTxnId) params.set('tx', merchantTxnId);
        const absTicketUrl = absoluteFromPath(ticketPath);
        if (absTicketUrl) params.set('ticket', absTicketUrl);

        const successUrl = `${prefix}/payment/success?${params.toString()}`;
        return res.redirect(successUrl);

    } catch (err) {
        logger.error('PhonePe return error', { err: err.message });
        return res.redirect(`${resolveClientBaseUrl()}/payment/return?status=error`);
    }
};
