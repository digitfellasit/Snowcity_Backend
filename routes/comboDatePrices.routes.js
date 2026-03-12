const express = require('express');
const router = express.Router();
const comboDatePricesCtrl = require('../controllers/comboDatePrices.controller');
const { requireAuth } = require('../middlewares/authMiddleware');

// All routes require authentication
router.use(requireAuth);

// GET /api/admin/combo-date-prices/:combo_id - Get all date prices for combo
router.get('/:combo_id', comboDatePricesCtrl.getPrices);

// GET /api/admin/combo-date-prices/:combo_id/children/:date - Get child attraction prices for date
router.get('/:combo_id/children/:date', comboDatePricesCtrl.getChildAttractionPrices);

// POST /api/admin/combo-date-prices/:combo_id/bulk - Bulk set prices for multiple dates
router.post('/:combo_id/bulk', comboDatePricesCtrl.bulkSetPrices);

// PUT /api/admin/combo-date-prices/:combo_id/:date - Set price for specific date
router.put('/:combo_id/:date', comboDatePricesCtrl.setPrice);

// DELETE /api/admin/combo-date-prices/:combo_id/:date - Delete price for specific date
router.delete('/:combo_id/:date', comboDatePricesCtrl.deletePrice);

module.exports = router;

