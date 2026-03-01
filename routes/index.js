const express = require('express');
const router = express.Router();

const { defaultLimiter } = require('../middlewares/rateLimiter');
const { cachePublic } = require('../middlewares/cacheMiddleware');

// Global rate limiter for public API
router.use(defaultLimiter);

// Public/user routes
router.use('/auth', require('./auth.routes'));
router.use('/user', require('../user/routes'));
router.use('/users', require('./users.routes'));
router.use('/attractions', cachePublic(300), require('./attractions.routes'));      // 5 min
router.use('/slots', require('./slots.routes'));
router.use('/bookings', require('./bookings.routes'));
router.use('/addons', cachePublic(300), require('./addons.routes'));                // 5 min
router.use('/combos', cachePublic(300), require('./combos.routes'));                // 5 min
router.use('/combo-slots', require('./comboSlots.routes'));
router.use('/coupons', cachePublic(300), require('./coupons.routes'));              // 5 min
router.use('/dynamic-pricing', cachePublic(300), require('./dynamicPricing.public.routes')); // 5 min
router.use('/offers', cachePublic(300), require('./offers.routes'));                // 5 min
router.use('/pages', cachePublic(600), require('./pages.routes'));                  // 10 min
router.use('/blogs', cachePublic(600), require('./blogs.routes'));                  // 10 min
router.use('/banners', cachePublic(300), require('../user/routes/banners.routes')); // 5 min
router.use('/uploads', cachePublic(3600), require('./uploads.routes'));             // 1 hr
router.use('/tickets', require('./ticketsvirtual.routes'));
router.use('/', require('./gallery.public'));
router.use('/', require('./pages.public'));
router.use('/social', require('./instagram.routes'));
router.use('/track', require('./tracking.routes'));
router.use('/site-settings', cachePublic(1800), require('./siteSettings.routes')); // 30 min
router.use('/payments', require('./payments.routes'));
router.use('/resolve-slug', cachePublic(300), require('./resolveSlug.routes'));     // 5 min
router.use('/webhooks', require('./webhooks.routes'));

// Admin auth routes (public - no authentication required)
router.use('/admin/auth', require('../admin/routes/adminAuth.routes'));

// Admin routes (protected inside admin/router)
router.use('/admin', require('../admin/routes'));

// Base
router.get('/', (req, res) => res.json({ api: 'SnowCity', version: '1.0.0' }));

module.exports = router;