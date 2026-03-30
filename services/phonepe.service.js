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
   * @param {string} params.customerName - Customer name
   * @returns {Promise<Object>}
   */
  async initiate({ merchantTxnNo, amount, customerMobileNo, mobileNumber, merchantUserId, customerEmailID, customerName = '', email }) {
    const phone = mobileNumber || customerMobileNo;
    const mail = email || customerEmailID;

    logger.info('PhonePe Service: Initiating payment', { merchantTxnNo, amount, phone, customerName });
    console.log(`[DEBUG] PhonePe Service Initiate: txn=${merchantTxnNo}, name=${customerName}`);

    try {
      // config/phonepe.js handles OAuth and Paise conversion (Rupees * 100)
      const result = await phonepe.initiatePayment({
        merchantTransactionId: merchantTxnNo,
        amount: amount, // Pass rupees, config converts to paise
        merchantUserId: merchantUserId || `USER_${Date.now()}`,
        mobileNumber: phone,
        customerName: customerName,
        email: mail
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
    // Controller delivers RUPEES now.
    return this.initiate({
      merchantTxnNo: paymentData.merchantOrderId,
      amount: paymentData.amount,
      customerName: paymentData.customerName,
      mobileNumber: paymentData.mobile,
      email: paymentData.email,
      merchantUserId: `USER_${Date.now()}` // generic ID for API requirement
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
