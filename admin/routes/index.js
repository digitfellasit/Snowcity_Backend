const express = require('express');
const router = require('express').Router();

// Public admin routes (no authentication required) - MUST come before protected routes
router.use('/auth', require('./adminAuth.routes'));

// Now apply authentication middleware to all subsequent routes
const { adminAuth } = require('../middleware/adminAuth');
const { attachScopes } = require('../middleware/scopedAccess');

router.use(adminAuth);
router.use(attachScopes);

router.get('/', (req, res) => res.json({ admin: true, status: 'ok' }));

// Mount sub-routes
router.use('/admins', require('./admins.routes'));
router.use('/dashboard', require('./dashboard.routes'));
router.use('/users', require('./users.routes'));
router.use('/roles', require('./roles.routes'));
router.use('/permissions', require('./permissions.routes'));
router.use('/settings', require('./settings.routes'));
router.use('/notifications', require('./notifications.routes'));
router.use('/holidays', require('./holidays.routes'));

router.use('/attractions', require('./attractions.routes'));
router.use('/attraction-slots', require('./attractionSlots.routes'));
router.use('/slots', require('./slots.routes'));
router.use('/bookings', require('./bookings.routes'));
router.use('/addons', require('./addons.routes'));
router.use('/combos', require('./combos.routes'));
router.use('/combo-slots', require('./comboSlots.routes'));
router.use('/coupons', require('./coupons.routes'));
router.use('/offers', require('./offers.routes'));
router.use('/banners', require('./banners.routes'));
router.use('/pages', require('./pages.routes'));
router.use('/blogs', require('./blogs.routes'));
router.use('/gallery', require('./gallery.routes'));
router.use('/analytics', require('./analytics.routes'));
router.use('/conversion', require('./conversion.routes'));
router.use('/uploads', require('./uploads.routes'));
router.use('/dynamic-pricing', require('./dynamicPricing.routes'));
router.use('/attraction-date-prices', require('../../routes/attractionDatePrices.routes'));
router.use('/combo-date-prices', require('../../routes/comboDatePrices.routes'));

module.exports = router;