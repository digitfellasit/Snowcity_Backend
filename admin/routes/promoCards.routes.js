const router = require('express').Router();
const ctrl = require('../controllers/promoCards.controller');

router.get('/', ctrl.listPromoCards);
router.get('/:id', ctrl.getPromoCardById);
router.post('/', ctrl.createPromoCard);
router.put('/:id', ctrl.updatePromoCard);
router.delete('/:id', ctrl.deletePromoCard);

module.exports = router;
