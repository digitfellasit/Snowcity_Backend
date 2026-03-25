const router = require('express').Router();
const ctrl = require('../user/controllers/offers.controller');

// Public
router.get('/', ctrl.listOffers);
router.get('/:id/availability', ctrl.getOfferAvailability);
router.get('/:id', ctrl.getOfferById);

module.exports = router;