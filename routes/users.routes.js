const router = require('express').Router();
const { requireAuth } = require('../middlewares/authMiddleware');

const profileCtrl = require('../user/controllers/profile.controller');
const bookingsCtrl = require('../user/controllers/bookings.controller');
const notificationsCtrl = require('../user/controllers/notifications.controller');

// Current user utilities
router.get('/me', requireAuth, profileCtrl.getProfile);
router.patch('/me', requireAuth, profileCtrl.updateProfile);

// Bookings
router.get('/me/bookings', requireAuth, bookingsCtrl.listMyBookings);

// --- FIXED LINE BELOW ---
// Changed 'getMyBookingById' to 'getOrderDetails'
router.get('/me/bookings/:id', requireAuth, bookingsCtrl.getOrderDetails);

router.get('/me/notifications', requireAuth, notificationsCtrl.listMyNotifications);

// Ticket download (generated on-the-fly, no file storage)
router.get('/me/bookings/:id/ticket', requireAuth, bookingsCtrl.downloadTicket);

module.exports = router;