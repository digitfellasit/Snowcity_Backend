const router = require('express').Router();
const ctrl = require('../controllers/offers.controller');

// Public
router.get('/', ctrl.listOffers);
router.get('/:id', ctrl.getOfferById);
router.get('/:id/availability', ctrl.getOfferAvailability);

module.exports = router;