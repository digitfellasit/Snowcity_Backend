const router = require('express').Router();
const dynamicPricingModel = require('../models/dynamicPricing.model');
const attractionDatePricesModel = require('../models/attractionDatePrices.model');
const comboDatePricesModel = require('../models/comboDatePrices.model');

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

        let hasDynamicPricing = Array.isArray(rules) && rules.length > 0;

        // Also check date-specific pricing (attraction_date_prices / combo_date_prices)
        if (!hasDynamicPricing) {
            try {
                const normalizedType = String(target_type).toLowerCase();
                if (normalizedType === 'attraction') {
                    const datePrice = await attractionDatePricesModel.getDatePrice(Number(target_id), date);
                    if (datePrice) hasDynamicPricing = true;
                } else if (normalizedType === 'combo') {
                    const datePrice = await comboDatePricesModel.getDatePrice(Number(target_id), date);
                    if (datePrice) hasDynamicPricing = true;
                }
            } catch (_) {
                // silently continue
            }
        }

        res.json({
            hasDynamicPricing,
            rules: hasDynamicPricing
                ? rules.map((r) => ({
                    rule_id: r.rule_id,
                    name: r.name,
                    price_adjustment_type: r.price_adjustment_type,
                    price_adjustment_value: r.price_adjustment_value,
                    child_price_adjustments: r.child_price_adjustments || null,
                    day_selection_mode: r.day_selection_mode || 'all_days',
                }))
                : [],
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
