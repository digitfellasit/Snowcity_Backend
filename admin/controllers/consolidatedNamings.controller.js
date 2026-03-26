const consolidatedNamingsModel = require('../../models/consolidatedNamings.model');

exports.listConsolidatedNamings = async (req, res, next) => {
  try {
    const data = await consolidatedNamingsModel.listConsolidatedNamings();
    res.json({ data, meta: { count: data.length } });
  } catch (err) {
    next(err);
  }
};

exports.createConsolidatedNaming = async (req, res, next) => {
  try {
    const payload = req.body || {};
    if (Array.isArray(payload.products)) {
      const { product_type, price_card_name } = payload;
      const results = [];
      for (const p of payload.products) {
        results.push(await consolidatedNamingsModel.createConsolidatedNaming({
          product_type,
          price_card_name,
          product_name: p.product_name,
          ref_price: p.ref_price
        }));
      }
      return res.status(201).json(results);
    }
    const row = await consolidatedNamingsModel.createConsolidatedNaming(payload);
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
};

exports.updateConsolidatedNaming = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const row = await consolidatedNamingsModel.updateConsolidatedNaming(id, req.body || {});
    if (!row) return res.status(404).json({ error: 'Entry not found' });
    res.json(row);
  } catch (err) {
    next(err);
  }
};

exports.deleteConsolidatedNaming = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const ok = await consolidatedNamingsModel.deleteConsolidatedNaming(id);
    if (!ok) return res.status(404).json({ error: 'Entry not found' });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
};
