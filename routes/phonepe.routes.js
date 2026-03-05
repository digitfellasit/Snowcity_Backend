const express = require('express');
const router = express.Router();
const phonepeController = require('../controllers/phonepe.controller');
const { requireAuth } = require('../middlewares/authMiddleware');

// Payment initiation - requires authentication
router.post('/initiate', requireAuth, phonepeController.initiatePayment);

// Payment status check by order ID - requires authentication (for existing flow)
router.get('/status/:orderId', requireAuth, phonepeController.checkPaymentStatus);

// ✅ Public status check by merchantTransactionId (txnId) - NO AUTH required
// Called by frontend PaymentStatus page after PhonePe redirects back to snowcityblr.com
router.get('/status/txn/:txnId', phonepeController.verifyPaymentByTxnId);

module.exports = router;

