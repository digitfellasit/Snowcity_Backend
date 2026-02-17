const express = require('express');
const router = express.Router();
const attractionDatePricesCtrl = require('../controllers/attractionDatePrices.controller');
const { requireAuth } = require('../middlewares/authMiddleware');

// All routes require authentication
router.use(requireAuth);

// GET /api/admin/attraction-date-prices/:attraction_id - Get all date prices for attraction
router.get('/:attraction_id', attractionDatePricesCtrl.getPrices);

// POST /api/admin/attraction-date-prices/:attraction_id/bulk - Bulk set prices for multiple dates
router.post('/:attraction_id/bulk', attractionDatePricesCtrl.bulkSetPrices);

// PUT /api/admin/attraction-date-prices/:attraction_id/:date - Set price for specific date
router.put('/:attraction_id/:date', attractionDatePricesCtrl.setPrice);

// DELETE /api/admin/attraction-date-prices/:attraction_id/:date - Delete price for specific date
router.delete('/:attraction_id/:date', attractionDatePricesCtrl.deletePrice);

module.exports = router;
