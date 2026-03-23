const promoCardsModel = require('../../models/promoCards.model');
const logger = require('../../config/logger');

exports.listPromoCards = async (req, res, next) => {
  try {
    const active = req.query.active === undefined ? null : String(req.query.active).toLowerCase() === 'true';
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const offset = (page - 1) * limit;

    const data = await promoCardsModel.listPromoCards({ active, limit, offset });
    
    res.json({ data, meta: { page, limit, count: data.length } });
  } catch (err) {
    next(err);
  }
};

exports.getPromoCardById = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const row = await promoCardsModel.getPromoCardById(id);
    if (!row) return res.status(404).json({ error: 'Promo Card not found' });
    res.json(row);
  } catch (err) {
    next(err);
  }
};

exports.createPromoCard = async (req, res, next) => {
  try {
    const row = await promoCardsModel.createPromoCard(req.body || {});
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
};

exports.updatePromoCard = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const row = await promoCardsModel.updatePromoCard(id, req.body || {});
    if (!row) return res.status(404).json({ error: 'Promo Card not found' });
    res.json(row);
  } catch (err) {
    next(err);
  }
};

exports.deletePromoCard = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const ok = await promoCardsModel.deletePromoCard(id);
    if (!ok) return res.status(404).json({ error: 'Promo Card not found' });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
};
