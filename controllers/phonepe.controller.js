const phonepeService = require('../services/phonepe.service');
const bookingsModel = require('../models/bookings.model');

class PhonePeController {
  /**
   * Initiate PhonePe payment
   */
  async initiatePayment(req, res) {
    try {
      const { orderId, email, mobile, amount } = req.body;

      // Validate required parameters
      if (!orderId || !amount || !email || !mobile) {
        return res.status(400).json({
          success: false,
          error: 'Missing required parameters: orderId, amount, email, mobile'
        });
      }

      // Get order details to verify amount
      const order = await bookingsModel.getOrderWithDetails(orderId);
      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      // Verify amount matches order total
      if (Math.abs(parseFloat(amount) - parseFloat(order.total_amount)) > 0.01) {
        return res.status(400).json({
          success: false,
          error: 'Payment amount does not match order total'
        });
      }

      // Create payment request payload
      const paymentData = {
        merchantOrderId: orderId,
        amount: Math.round(parseFloat(amount) * 100), // Convert to paise
        udf1: email,
        udf2: mobile,
        redirectUrl: process.env.PHONEPE_CALLBACK_URL,
        message: `Payment for Order ${orderId}`,
        paymentModeConfig: {
          // Configure available payment modes if needed
        }
      };

      console.log('💳 Initiating PhonePe payment for order:', orderId);

      const paymentResponse = await phonepeService.createPayment(paymentData);

      if (paymentResponse.success) {
        // Update order with PhonePe transaction details
        await bookingsModel.updatePaymentStatus(orderId, 'initiated', paymentResponse.merchantTransactionId);

        res.json({
          success: true,
          redirectUrl: paymentResponse.redirectUrl,
          merchantTransactionId: paymentResponse.merchantTransactionId,
          message: 'PhonePe payment initiated successfully'
        });
      } else {
        console.error('❌ PhonePe payment initiation failed:', paymentResponse.error);

        // Update order with failed status
        await bookingsModel.updatePaymentStatus(orderId, 'failed');

        res.status(500).json({
          success: false,
          error: 'Failed to initiate PhonePe payment',
          details: paymentResponse.error
        });
      }

    } catch (error) {
      console.error('❌ PhonePe payment initiation error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during payment initiation'
      });
    }
  }

  /**
   * Check PhonePe payment status
   */
  async checkPaymentStatus(req, res) {
    try {
      const { orderId } = req.params;

      if (!orderId) {
        return res.status(400).json({
          success: false,
          error: 'Order ID is required'
        });
      }

      console.log('🔍 Checking PhonePe payment status for order:', orderId);

      const statusResponse = await phonepeService.checkPaymentStatus(orderId);

      if (statusResponse.success) {
        const paymentStatus = statusResponse.status;

        // Update order status based on payment result
        let updateStatus = 'pending'; // default
        if (paymentStatus === 'completed') {
          updateStatus = 'completed';
        } else if (paymentStatus === 'failed') {
          updateStatus = 'failed';
        } else if (paymentStatus === 'cancelled') {
          updateStatus = 'cancelled';
        }

        await bookingsModel.updatePaymentStatus(orderId, updateStatus, statusResponse.data?.transactionId);

        res.json({
          success: true,
          status: paymentStatus,
          data: statusResponse.data,
          message: `Payment status: ${paymentStatus}`
        });
      } else {
        console.error('❌ PhonePe status check failed:', statusResponse.error);
        res.status(500).json({
          success: false,
          error: 'Failed to check payment status',
          details: statusResponse.error
        });
      }

    } catch (error) {
      console.error('❌ PhonePe status check error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error during status check'
      });
    }
  }

  /**
   * Handle PhonePe webhook notifications
   */
  async handleWebhook(req, res) {
    try {
      const webhookData = req.body;
      const signature = req.headers['x-phonepe-signature'] || req.headers['signature'];

      console.log('📡 Received PhonePe webhook:', webhookData);

      // TODO: Verify webhook signature using PHONEPE_WEBHOOK_SECRET
      // const isValidSignature = verifyWebhookSignature(webhookData, signature);

      if (!webhookData || !webhookData.merchantOrderId) {
        return res.status(400).json({ success: false, error: 'Invalid webhook data' });
      }

      const { merchantOrderId, transactionId, state, amount } = webhookData;

      // Map PhonePe state to our status
      let paymentStatus = 'pending';
      if (state === 'PAYMENT_SUCCESS') {
        paymentStatus = 'completed';
      } else if (state === 'PAYMENT_FAILED') {
        paymentStatus = 'failed';
      } else if (state === 'PAYMENT_CANCELLED') {
        paymentStatus = 'cancelled';
      }

      console.log('📡 Processing webhook for order:', merchantOrderId, 'status:', paymentStatus);

      // Update order payment status
      await bookingsModel.updatePaymentStatus(merchantOrderId, paymentStatus, transactionId);

      console.log('✅ Payment status updated via webhook for order:', merchantOrderId);

      res.json({ success: true, message: 'Webhook processed successfully' });

    } catch (error) {
      console.error('❌ PhonePe webhook processing error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process webhook'
      });
    }
  }

  /**
   * Handle PhonePe return (redirect after payment)
   */
  async handleReturn(req, res) {
    try {
      const { merchantOrderId, transactionId, code } = req.query;

      console.log('🔄 PhonePe return received:', { merchantOrderId, transactionId, code });

      // Redirect to frontend with payment result
      const frontendUrl = code === 'PAYMENT_SUCCESS'
        ? `${process.env.PHONEPE_SUCCESS_URL}?orderId=${merchantOrderId}&transactionId=${transactionId}`
        : `${process.env.PHONEPE_FAILURE_URL}?orderId=${merchantOrderId}&transactionId=${transactionId}&code=${code}`;

      res.redirect(frontendUrl);

    } catch (error) {
      console.error('❌ PhonePe return handling error:', error);
      res.redirect(`${process.env.PHONEPE_FAILURE_URL}?error=processing_error`);
    }
  }
}

module.exports = new PhonePeController();
