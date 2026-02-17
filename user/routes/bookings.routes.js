const router = require('express').Router();

const bookingsCtrl = require('../controllers/bookings.controller');
const { requireAuth } = require('../../middlewares/authMiddleware');
const { defaultLimiter, paymentLimiter } = require('../../middlewares/rateLimiter');

// Rate-limit all booking endpoints in this router
router.use(defaultLimiter);

// Current user's bookings (Listed by Order)
router.get('/', requireAuth, bookingsCtrl.listMyBookings);

// Get specific Order details (Receipt view)
router.get('/:id', requireAuth, bookingsCtrl.getOrderDetails);

// Create Order (Accepts single item object OR array of items)
router.post('/', requireAuth, bookingsCtrl.createOrder);

// PayPhi helpers (Operates on Order ID now)
router.post('/:id/pay/payphi/initiate', requireAuth, paymentLimiter, bookingsCtrl.initiatePayPhiPayment);
router.get('/:id/pay/payphi/status', requireAuth, bookingsCtrl.checkPayPhiStatus);

// PhonePe helpers (Operates on Order ID now)
router.post('/:id/pay/phonepe/initiate', requireAuth, paymentLimiter, bookingsCtrl.initiatePhonePePayment);
router.get('/:id/pay/phonepe/status', requireAuth, bookingsCtrl.checkPhonePeStatus);

module.exports = router;