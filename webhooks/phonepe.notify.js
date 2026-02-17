// webhooks/phonepe.notify.js
const logger = require('../config/logger');
const phonepe = require('../config/phonepe');
const bookingService = require('../services/bookingService');

/**
 * PhonePe S2S notification callback
 * PhonePe sends server-to-server notifications here
 * POST /api/webhooks/phonepe/notify
 */
module.exports = async (req, res) => {
    try {
        // 1. Verify Signature (V2)
        const isValid = phonepe.verifyWebhookSignature(req);
        if (!isValid) {
            logger.warn('PhonePe notify: Invalid signature', {
                headers: req.headers,
                body: req.body
            });
            return res.status(401).json({ success: false, message: 'Invalid signature' });
        }

        // 2. Decode V2 Payload
        // V2 Body is { response: "base64..." }
        const base64Response = req.body?.response;
        if (!base64Response) {
            logger.warn('PhonePe notify: Missing response field in body');
            return res.status(400).json({ success: false, message: 'Invalid payload' });
        }

        const payload = phonepe.decodeResponse(base64Response);
        logger.info('PhonePe S2S notification received (V2)', {
            payload: JSON.stringify(payload).substring(0, 200) // Log first 200 chars
        });

        // 3. Extract Details
        const { merchantOrderId, code, state } = payload.data || {};
        const transactionId = payload.data?.transactionId;

        if (!merchantOrderId) {
            logger.warn('PhonePe notify: Missing merchantOrderId in payload');
            return res.status(400).json({ success: false, message: 'Missing order ID' });
        }

        logger.info('PhonePe notify processing', {
            merchantOrderId,
            transactionId,
            code,
            state
        });

        // 4. Process Payment Status
        // We defer to bookingService.checkPhonePeStatus which validates against PhonePe API
        // and handles ticket generation, email/whatsapp sending.
        // Even though we have status here, doing a check confirms it securely.

        // However, if the status is FAILED/CANCELLED, checkPhonePeStatus might throw or handle it.
        // Let's call it regardless to ensure our DB is in sync.

        try {
            await bookingService.checkPhonePeStatus(merchantOrderId);

            logger.info('PhonePe notify: Webhook processed successfully via bookingService', {
                merchantOrderId,
                state
            });
            return res.json({ success: true, message: 'Webhook processed successfully' });

        } catch (svcErr) {
            // It's possible checkPhonePeStatus throws if payment is not success or other errors.
            // But for webhook, we should ack 200 if we processed it, even if payment failed.
            // If it's an internal error, 500 is appropriate to trigger retry.
            // If it's "Order not found" or "Payment failed", we should log and return 200 to stop retries?
            // Usually, if we successfully updated DB to "Failed", we return 200.

            logger.error('PhonePe notify: Service processing error', {
                err: svcErr.message,
                merchantOrderId
            });

            // If the error implies we did our job (e.g. updated to failed), return 200.
            // But checkPhonePeStatus throws error.
            // Let's analyze svcErr.
            // For now, return 500 to trigger retry unless we are sure.
            return res.status(500).json({ success: false, message: 'Webhook processing failed' });
        }

    } catch (err) {
        logger.error('PhonePe notify error', { err: err.message, stack: err.stack });
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};
