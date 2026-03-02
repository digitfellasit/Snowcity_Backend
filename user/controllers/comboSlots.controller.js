const comboSlotService = require('../../services/comboSlotService');
const comboService = require('../../services/comboService');
const dynamicPricingService = require('../../services/dynamicPricingService');

const enrichComboSlotWithPricing = async (slot, combo) => {
  if (!slot || !combo) return slot;
  const basePrice = slot.price || combo.total_price || combo.combo_price || 0;
  if (!basePrice) {
    return { ...slot, base_price: basePrice, price: basePrice };
  }

  // Parse date and time for pricing calculation
  const bookingDate = slot.start_date ? new Date(slot.start_date) : new Date();
  const bookingTime = slot.start_time || '12:00:00'; // Default to noon if no time

  const pricingResult = await dynamicPricingService.calculateDynamicPrice({
    itemType: 'combo',
    itemId: combo.combo_id || combo.id,
    basePrice: basePrice,
    date: bookingDate,
    time: bookingTime,
    quantity: 1,
  });

  const isDPActive = Array.isArray(pricingResult.appliedRules) &&
    pricingResult.appliedRules.some(r => r.type === 'dynamic_pricing_adjustment');

  return {
    ...slot,
    base_price: basePrice,
    price: pricingResult.finalPrice,
    original_price: pricingResult.originalPrice,
    discount_amount: pricingResult.discountAmount,
    applied_rules: pricingResult.appliedRules,
    dynamic_pricing_active: isDPActive,
    pricing: {
      base_price: basePrice,
      final_price: pricingResult.finalPrice,
      original_price: pricingResult.originalPrice,
      discount_amount: pricingResult.discountAmount,
      applied_rules: pricingResult.appliedRules,
      dynamic_pricing_active: isDPActive,
    },
  };
};

const mapSlotsWithPricing = async (slots = [], combo = null) => {
  if (!combo || !Array.isArray(slots) || !slots.length) return slots;
  return Promise.all(slots.map((slot) => enrichComboSlotWithPricing(slot, combo)));
};

// GET /api/combo-slots
exports.listSlots = async (req, res, next) => {
  try {
    const combo_id = req.query.combo_id ? Number(req.query.combo_id) : null;
    const date = req.query.date || null;
    const start_date = req.query.start_date || null;
    const end_date = req.query.end_date || null;

    const data = await comboSlotService.list({ combo_id, date, start_date, end_date });

    // If we have combo_id, enrich with pricing
    let enrichedData = data;
    if (combo_id) {
      const combo = await comboService.getById(combo_id);
      if (combo) {
        enrichedData = await mapSlotsWithPricing(data, combo);
      }
    }

    res.json({ data: enrichedData, meta: { count: enrichedData.length } });
  } catch (err) {
    next(err);
  }
};

// GET /api/combo-slots/:id
exports.getSlotById = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const row = await comboSlotService.getById(id);
    res.json(row);
  } catch (err) {
    next(err);
  }
};
