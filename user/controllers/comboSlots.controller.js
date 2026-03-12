const comboSlotService = require('../../services/comboSlotService');
const comboService = require('../../services/comboService');
const dynamicPricingService = require('../../services/dynamicPricingService');

const { applyOfferPricing } = require('../../services/offerPricing');

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const resolveComboSlotBasePrice = (slot = {}, combo = {}) => {
  const v1 = toNumber(slot.base_price, 0);
  const v2 = toNumber(slot.price, 0);
  const v3 = toNumber(combo?.pricing?.base_price, 0);
  const v4 = toNumber(
    combo?.combo_price ??
    combo?.price ??
    combo?.total_price ??
    combo?.starting_price ??
    combo?.min_price ??
    0,
    0
  );
  
  return v1 || v2 || v3 || v4;
};

const normalizeComboSlotId = (slot = {}) => {
  if (!slot?.combo_slot_id) return null;
  const numeric = Number(slot.combo_slot_id);
  return Number.isFinite(numeric) ? numeric : null;
};

const enrichComboSlotWithPricing = async (slot, combo, selectedDate = null) => {
  if (!slot || !combo) return slot;
  const basePrice = resolveComboSlotBasePrice(slot, combo);
  if (!basePrice) {
    return { ...slot, base_price: basePrice, price: basePrice };
  }

  // Use selectedDate from query param, then slot.start_date, then today
  const bookingDate = selectedDate
    ? new Date(selectedDate)
    : slot.start_date
      ? new Date(slot.start_date)
      : new Date();
  const bookingTime = slot.start_time || '12:00:00'; // Default to noon if no time

  const pricingResult = await dynamicPricingService.calculateDynamicPrice({
    itemType: 'combo',
    itemId: combo.combo_id || combo.id,
    basePrice: basePrice,
    date: bookingDate,
    time: bookingTime,
    quantity: 1,
  });

  const offerPricing = await applyOfferPricing({
    targetType: 'combo',
    targetId: combo.combo_id || combo.id,
    slotType: 'combo',
    slotId: normalizeComboSlotId(slot),
    baseAmount: basePrice,
    booking_date: bookingDate,
    booking_time: bookingTime,
  });

  const isDPActive = Array.isArray(pricingResult.appliedRules) &&
    pricingResult.appliedRules.some(r => r.type === 'dynamic_pricing_adjustment');

  const finalPrice = isDPActive ? pricingResult.finalPrice : offerPricing.unit;
  const originalPrice = isDPActive ? pricingResult.originalPrice : basePrice;
  const discountAmount = isDPActive ? pricingResult.discountAmount : offerPricing.discount;
  const discountPercent = isDPActive ? 0 : offerPricing.discount_percent;

  return {
    ...slot,
    base_price: basePrice,
    price: finalPrice,
    original_price: originalPrice,
    discount_amount: discountAmount,
    offer: offerPricing.offer,
    offer_discount: offerPricing.discount,
    offer_discount_percent: offerPricing.discount_percent,
    applied_rules: pricingResult.appliedRules,
    dynamic_pricing_active: isDPActive,
    pricing: {
      base_price: basePrice,
      final_price: finalPrice,
      original_price: originalPrice,
      discount_amount: discountAmount,
      discount_percent: discountPercent,
      offer: offerPricing.offer,
      applied_rules: pricingResult.appliedRules,
      dynamic_pricing_active: isDPActive,
    },
  };
};

const mapSlotsWithPricing = async (slots = [], combo = null, selectedDate = null) => {
  if (!combo || !Array.isArray(slots) || !slots.length) return slots;
  return Promise.all(slots.map((slot) => enrichComboSlotWithPricing(slot, combo, selectedDate)));
};

exports.mapSlotsWithPricing = mapSlotsWithPricing;

// GET /api/combo-slots
exports.listSlots = async (req, res, next) => {
  try {
    const combo_id = req.query.combo_id ? Number(req.query.combo_id) : null;
    const date = req.query.date || null;
    const start_date = req.query.start_date || null;
    const end_date = req.query.end_date || null;

    const data = await comboSlotService.list({ combo_id, date, start_date, end_date });

    // If we have combo_id, enrich with pricing using the selected date
    let enrichedData = data;
    if (combo_id) {
      const combo = await comboService.getById(combo_id);
      if (combo) {
        enrichedData = await mapSlotsWithPricing(data, combo, date);
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
