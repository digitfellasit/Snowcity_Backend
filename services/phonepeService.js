const phonepe = require('../config/phonepe');

/**
 * Initiate PhonePe payment
 * @param {Object} params
 * @param {string} params.merchantTxnNo - Unique transaction number
 * @param {number} params.amount - Amount in rupees
 * @param {string} params.customerEmailID - Customer email
 * @param {string} params.customerMobileNo - Customer mobile number
 * @param {string} params.merchantUserId - User ID
 * @returns {Promise<Object>} Payment initiation response
 */
async function initiate({ merchantTxnNo, amount, customerEmailID, customerMobileNo, merchantUserId }) {
  const data = await phonepe.initiatePayment({
    merchantTransactionId: merchantTxnNo,
    amount: Math.round(Number(amount)), // Amount in rupees for checkout v2
    merchantUserId: merchantUserId || `USER_${Date.now()}`,
    mobileNumber: customerMobileNo,
  });

  return {
    raw: data,
    redirectUrl: data.redirectUrl,
    merchantTransactionId: data.merchantTransactionId || merchantTxnNo,
    success: data.success || false
  };
}

/**
 * Check PhonePe payment status
 * @param {Object} params
 * @param {string} params.merchantTxnNo - Transaction number to check
 * @returns {Promise<Object>} Payment status response
 */
async function status({ merchantTxnNo }) {
  const data = await phonepe.checkStatus(merchantTxnNo);

  return {
    raw: data,
    success: phonepe.isSuccessStatus(data),
    code: data.code,
    state: data.state,
    transactionId: data.transactionId,
    amount: data.amount
  };
}

/**
 * Initiate PhonePe refund
 * @param {Object} params
 * @param {string} params.newMerchantTxnNo - New transaction number for refund
 * @param {string} params.originalTxnNo - Original transaction number
 * @param {number} params.amount - Refund amount in rupees
 * @returns {Promise<Object>} Refund response
 */
async function refund({ newMerchantTxnNo, originalTxnNo, amount }) {
  const data = await phonepe.initiateRefund({
    merchantTransactionId: originalTxnNo,
    refundTransactionId: newMerchantTxnNo,
    amount: Number(amount) // Pass rupees, PhonePe config will convert to paise
  });

  return {
    raw: data,
    success: data.success || false,
    code: data.code,
    message: data.message
  };
}

module.exports = { initiate, status, refund };