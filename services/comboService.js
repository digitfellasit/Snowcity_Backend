const combosModel = require('../models/combos.model');
const { applyOfferPricing } = require('./offerPricing');

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

async function withPricing(row) {
  if (!row) return row;
  const base = toNumber(row.combo_price || row.total_price || row.price || row.amount || 0, 0);
  const pricing = await applyOfferPricing({
    targetType: 'combo',
    targetId: row.combo_id,
    baseAmount: base,
  });

  let childAdjustments = pricing?.offer?.combo_child_adjustments;
  let finalUnit = pricing.unit;
  let discountAmount = pricing.discount;
  let discountPercent = pricing.discount_percent;

  if (childAdjustments && row.attraction_prices) {
    let newTotal = 0;
    const newAttractionPrices = { ...row.attraction_prices };
    
    for (const [attrId, price] of Object.entries(newAttractionPrices)) {
       const increment = Number(childAdjustments[attrId]) || 0;
       const adjustedPrice = Math.max(0, Number(price) + increment);
       newAttractionPrices[attrId] = adjustedPrice;
       newTotal += adjustedPrice;
    }
    
    row.attraction_prices = newAttractionPrices;
    finalUnit = newTotal;
    discountAmount = base - finalUnit; // can be negative for price increases
    discountPercent = base > 0 ? (discountAmount / base) * 100 : 0;
  }

  row.pricing = {
    base_price: base,
    final_price: finalUnit,
    discount_amount: discountAmount,
    discount_percent: discountPercent,
    offer: pricing.offer,
  };
  row.display_price = finalUnit;
  row.offer = pricing.offer;
  row.offer_discount_amount = discountAmount;
  row.offer_discount_percent = discountPercent;

  return row;
}

async function list({ active = null } = {}) {
  const rows = await combosModel.listCombos({ active });
  return Promise.all(rows.map((row) => withPricing({ ...row })));
}

async function getById(id) {
  const row = await combosModel.getComboById(id);
  if (!row) {
    const err = new Error('Combo not found');
    err.status = 404;
    throw err;
  }
  return withPricing({ ...row });
}

async function getBySlug(slug) {
  const row = await combosModel.getComboBySlug(slug);
  if (!row) {
    const err = new Error('Combo not found');
    err.status = 404;
    throw err;
  }
  return withPricing({ ...row });
}

async function create(payload) {
  return combosModel.createCombo(payload);
}

async function update(id, payload) {
  const row = await combosModel.updateCombo(id, payload);
  if (!row) {
    const err = new Error('Combo not found');
    err.status = 404;
    throw err;
  }
  return row;
}

async function remove(id) {
  const ok = await combosModel.deleteCombo(id);
  if (!ok) {
    const err = new Error('Combo not found');
    err.status = 404;
    throw err;
  }
  return { deleted: true };
}

module.exports = {
  list,
  getById,
  getBySlug,
  create,
  update,
  remove,
};