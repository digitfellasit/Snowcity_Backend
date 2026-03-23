const router = require('express').Router();
const ctrl = require('../user/controllers/promoCards.controller');

router.get('/', ctrl.listPromoCards);
router.get('/:id', ctrl.getPromoCardById);

module.exports = router;
