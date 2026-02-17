const express = require('express');
const router = express.Router();
const dynamicPricingCtrl = require('../controllers/dynamicPricing.controller');
const { requireAuth } = require('../middlewares/authMiddleware');

// All routes require authentication
router.use(requireAuth);

// GET /api/admin/dynamic-pricing - Get all rules
router.get('/', dynamicPricingCtrl.getRules);

// GET /api/admin/dynamic-pricing/:rule_id - Get specific rule
router.get('/:rule_id', dynamicPricingCtrl.getRuleById);

// POST /api/admin/dynamic-pricing - Create new rule
router.post('/', dynamicPricingCtrl.createRule);

// PUT /api/admin/dynamic-pricing/:rule_id - Update rule
router.put('/:rule_id', dynamicPricingCtrl.updateRule);

// DELETE /api/admin/dynamic-pricing/:rule_id - Delete rule
router.delete('/:rule_id', dynamicPricingCtrl.deleteRule);

// GET /api/admin/dynamic-pricing/applicable - Get applicable rules for target/date
router.get('/applicable/rules', dynamicPricingCtrl.getApplicableRules);

module.exports = router;