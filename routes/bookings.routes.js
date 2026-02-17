const router = require('express').Router();

const { defaultLimiter } = require('../middlewares/rateLimiter');

// Rate-limit all public booking endpoints
router.use(defaultLimiter);

// Public booking routes will be handled by user routes
// This file serves as a placeholder for future public booking features
// Currently, booking functionality is handled through /user/bookings

module.exports = router;
