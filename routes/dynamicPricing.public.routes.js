const router = require('express').Router();
const dynamicPricingModel = require('../models/dynamicPricing.model');

// GET /api/dynamic-pricing/check?target_type=attraction&target_id=1&date=2026-03-05
router.get('/check', async (req, res, next) => {
    try {
        const { target_type, target_id, date } = req.query;
        if (!target_type || !target_id || !date) {
            return res.status(400).json({
                error: 'Missing required query params: target_type, target_id, date',
            });
        }

        const rules = await dynamicPricingModel.getApplicableRules(
            target_type,
            Number(target_id),
            date
        );

        const hasDynamicPricing = Array.isArray(rules) && rules.length > 0;

        res.json({
            hasDynamicPricing,
            rules: hasDynamicPricing
                ? rules.map((r) => ({
                    rule_id: r.rule_id,
                    name: r.name,
                    price_adjustment_type: r.price_adjustment_type,
                    price_adjustment_value: r.price_adjustment_value,
                }))
                : [],
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
