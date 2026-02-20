// routes/tracking.routes.js
// Public (no auth) routes for conversion tracking
const router = require('express').Router();
const trackingService = require('../services/trackingService');

// POST /api/track/visit — log a page visit with UTM data
router.post('/visit', async (req, res, next) => {
    try {
        const {
            session_id,
            user_id,
            utm_source,
            utm_medium,
            utm_campaign,
            utm_content,
            utm_term,
            gclid,
            fbclid,
            landing_page,
        } = req.body;

        if (!session_id) {
            return res.status(400).json({ error: 'session_id is required' });
        }

        await trackingService.logVisit({
            session_id,
            user_id,
            utm_source,
            utm_medium,
            utm_campaign,
            utm_content,
            utm_term,
            gclid,
            fbclid,
            landing_page,
        });

        res.sendStatus(200);
    } catch (err) {
        next(err);
    }
});

// POST /api/track/booking — attribute a booking to its traffic source
router.post('/booking', async (req, res, next) => {
    try {
        const { session_id, order_id, amount, user_id } = req.body;

        if (!session_id) {
            return res.status(400).json({ error: 'session_id is required' });
        }

        const result = await trackingService.attributeBooking({
            session_id,
            order_id,
            amount,
            user_id,
        });

        res.json({ ok: true, source: result?.source, campaign: result?.campaign });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
