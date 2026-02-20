// admin/routes/conversion.routes.js
// Admin-protected conversion analytics & ad spend management
const router = require('express').Router();
const trackingService = require('../../services/trackingService');

// GET /api/admin/conversion/summary — source-level analytics
router.get('/summary', async (req, res, next) => {
    try {
        const { from, to } = req.query;

        const [summary, totals] = await Promise.all([
            trackingService.getConversionSummary({ from, to }),
            trackingService.getConversionTotals({ from, to }),
        ]);

        res.json({ totals, sources: summary });
    } catch (err) {
        next(err);
    }
});

// GET /api/admin/conversion/ad-spend — list all ad spend entries
router.get('/ad-spend', async (req, res, next) => {
    try {
        const data = await trackingService.listAdSpend();
        res.json(data);
    } catch (err) {
        next(err);
    }
});

// POST /api/admin/conversion/ad-spend — create ad spend entry
router.post('/ad-spend', async (req, res, next) => {
    try {
        const { source, campaign, spend, period_start, period_end } = req.body;

        if (!source || spend == null) {
            return res.status(400).json({ error: 'source and spend are required' });
        }

        const entry = await trackingService.createAdSpend({
            source,
            campaign,
            spend: Number(spend),
            period_start,
            period_end,
        });

        res.status(201).json(entry);
    } catch (err) {
        next(err);
    }
});

// DELETE /api/admin/conversion/ad-spend/:id — remove ad spend entry
router.delete('/ad-spend/:id', async (req, res, next) => {
    try {
        await trackingService.deleteAdSpend(req.params.id);
        res.sendStatus(204);
    } catch (err) {
        next(err);
    }
});

module.exports = router;
