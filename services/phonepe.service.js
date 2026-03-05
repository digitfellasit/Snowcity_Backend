const phonepe = require('../config/phonepe');
const logger = require('../config/logger');

/**
 * Unified PhonePe Service
 * Handles payment initiation, status checks, and refunds using the v2 Standard Checkout API.
 */
class PhonePeService {
  /**
   * Initiate a payment
   * @param {Object} params
   * @param {string} params.merchantTxnNo - Our unique transaction reference
   * @param {number} params.amount - Amount in RUPEES (will be converted to paise internally)
   * @param {string} params.customerEmailID - Backwards compatibility field
   * @param {string} params.customerMobileNo - Backwards compatibility field
   * @param {string} params.mobileNumber - Customer mobile
   * @param {string} params.merchantUserId - PhonePe user identifier
   * @returns {Promise<Object>}
   */
  async initiate({ merchantTxnNo, amount, customerMobileNo, mobileNumber, merchantUserId, customerEmailID }) {
    const phone = mobileNumber || customerMobileNo;

    logger.info('PhonePe Service: Initiating payment', { merchantTxnNo, amount, phone });

    try {
      // config/phonepe.js handles OAuth and Paise conversion (Rupees * 100)
      const result = await phonepe.initiatePayment({
        merchantTransactionId: merchantTxnNo,
        amount: amount, // Pass rupees, config converts to paise
        merchantUserId: merchantUserId || `USER_${Date.now()}`,
        mobileNumber: phone,
      });

      return {
        success: result.success,
        redirectUrl: result.redirectUrl,
        merchantTransactionId: result.merchantTransactionId || merchantTxnNo,
        phonePeOrderId: result.phonePeOrderId,
        message: result.message,
        raw: result.raw
      };
    } catch (error) {
      logger.error('PhonePe Service: Initiation failed', { error: error.message, merchantTxnNo });
      throw error;
    }
  }

  /**
   * Legacy/Controller compatibility wrapper
   */
  async createPayment(paymentData) {
    // If amount is already in paise (as sent by some controllers), we need to adjust
    // But to be safe, we'll assume the input is Rupees if it's small, or we'll change the caller.
    // DECISION: Unified service will expect RUPEES to match bookingService.
    // We will update the controller to pass RUPEES.

    return this.initiate({
      merchantTxnNo: paymentData.merchantOrderId,
      amount: paymentData.amount,
      mobileNumber: paymentData.udf2,
      merchantUserId: paymentData.udf1,
      customerEmailID: paymentData.udf1
    });
  }

  /**
   * Check payment status
   */
  async status({ merchantTxnNo }) {
    const result = await phonepe.checkStatus(merchantTxnNo);
    return {
      ...result,
      success: phonepe.isSuccessStatus(result)
    };
  }

  /**
   * Compatibility wrapper for checkPaymentStatus
   */
  async checkPaymentStatus(merchantOrderId) {
    return this.status({ merchantTxnNo: merchantOrderId });
  }

  /**
   * Initiate refund
   */
  async refund({ merchantTransactionId, refundTransactionId, amount }) {
    return phonepe.initiateRefund({
      merchantTransactionId,
      refundTransactionId,
      amount
    });
  }
}

module.exports = new PhonePeService();
