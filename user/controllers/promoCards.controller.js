const promoCardsModel = require('../../models/promoCards.model');
const logger = require('../../config/logger');

exports.listPromoCards = async (req, res, next) => {
  try {
    // Public API only ever returns active cards
    const data = await promoCardsModel.listPromoCards({ active: true, limit: 100 });
    res.json({ data });
  } catch (err) {
    next(err);
  }
};

exports.getPromoCardById = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const row = await promoCardsModel.getPromoCardById(id);
    if (!row || !row.active) return res.status(404).json({ error: 'Promo Card not found' });
    res.json(row);
  } catch (err) {
    next(err);
  }
};
