const express = require('express');
const router = express.Router();
const phonepeController = require('../controllers/phonepe.controller');
const { requireAuth } = require('../middlewares/authMiddleware');

// Payment initiation - requires authentication
router.post('/initiate', requireAuth, phonepeController.initiatePayment);

// Payment status check - requires authentication
router.get('/status/:orderId', requireAuth, phonepeController.checkPaymentStatus);

module.exports = router;
