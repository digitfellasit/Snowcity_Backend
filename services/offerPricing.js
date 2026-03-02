const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

async function applyOfferPricing({
  targetType,
  targetId,
  slotType = null,
  slotId = null,
  baseAmount = 0,
  booking_date = null,
  booking_time = null,
} = {}) {
  const base = toNumber(baseAmount, 0);
  const normalizedTargetId = targetId == null ? null : Number(targetId);
  const normalizedSlotId = slotId == null ? null : Number(slotId);

  // ── Same-day blocking: offers only apply for future dates ──────────
  const todayStr = new Date().toISOString().slice(0, 10);
  if (booking_date && booking_date <= todayStr) {
    return { unit: base, discount: 0, discount_percent: 0, offer: null };
  }
  // ───────────────────────────────────────────────────────────────────

  // Dynamic import to avoid circular dependency
  const offersModel = require('../models/offers.model');

  if (!offersModel?.findApplicableOfferRule || !targetType || !targetId || base <= 0) {
    return { unit: base, discount: 0, discount_percent: 0, offer: null };
  }

  // ── Dynamic Pricing Override ──────────────────────────────────────
  // If dynamic pricing rules exist for this target + date, skip all offers.
  if (booking_date && targetId != null) {
    try {
      const dynamicPricingModel = require('../models/dynamicPricing.model');
      const dpRules = await dynamicPricingModel.getApplicableRules(
        targetType,
        Number(targetId),
        booking_date,
      );
      if (Array.isArray(dpRules) && dpRules.length > 0) {
        return { unit: base, discount: 0, discount_percent: 0, offer: null };
      }

      // Also check date-specific pricing (attraction_date_prices / combo_date_prices)
      const normalizedType = String(targetType).toLowerCase();
      if (normalizedType === 'attraction') {
        const attractionDatePricesModel = require('../models/attractionDatePrices.model');
        const datePrice = await attractionDatePricesModel.getDatePrice(Number(targetId), booking_date);
        if (datePrice) {
          return { unit: base, discount: 0, discount_percent: 0, offer: null };
        }
      } else if (normalizedType === 'combo') {
        const comboDatePricesModel = require('../models/comboDatePrices.model');
        const datePrice = await comboDatePricesModel.getDatePrice(Number(targetId), booking_date);
        if (datePrice) {
          return { unit: base, discount: 0, discount_percent: 0, offer: null };
        }
      }
    } catch (_) {
      // silently continue if model unavailable
    }
  }
  // ─────────────────────────────────────────────────────────────────

  const match = await offersModel.findApplicableOfferRule({
    targetType,
    targetId: normalizedTargetId,
    slotType,
    slotId: normalizedSlotId,
    date: booking_date,
    time: booking_time,
  });

  if (!match) {
    return { unit: base, discount: 0, discount_percent: 0, offer: null };
  }

  const { offer, rule } = match;
  // Defensive check: for happy_hour rules ensure booking_time falls within rule window
  const matchTime = booking_time || null;
  try {
    if (offer?.rule_type === 'happy_hour') {
      const ruleFrom = rule?.time_from || null;
      const ruleTo = rule?.time_to || null;
      if (!ruleFrom || !ruleTo || !matchTime) {
        return { unit: base, discount: 0, discount_percent: 0, offer: null };
      }
      // Compare strings 'HH:MM:SS' directly is safe for same-day times
      if (String(matchTime) < String(ruleFrom) || String(matchTime) > String(ruleTo)) {
        return { unit: base, discount: 0, discount_percent: 0, offer: null };
      }
    }
  } catch (err) {
    // If any unexpected error, bail out to avoid wrongly applying discounts
    return { unit: base, discount: 0, discount_percent: 0, offer: null };
  }
  let discountType = rule?.rule_discount_type || offer.discount_type || (offer.discount_percent ? 'percent' : null);
  let discountValue = rule?.rule_discount_value ?? offer.discount_value ?? offer.discount_percent ?? 0;

  if (!discountType || !discountValue) {
    return { unit: base, discount: 0, discount_percent: 0, offer: null };
  }

  discountType = String(discountType).toLowerCase();
  let discount = discountType === 'amount'
    ? toNumber(discountValue, 0)
    : (toNumber(discountValue, 0) / 100) * base;

  if (offer.max_discount != null) {
    discount = Math.min(discount, Number(offer.max_discount));
  }
  discount = Math.min(discount, base);

  const finalUnit = toNumber(base - discount, 0);
  const discount_percent = base > 0 ? (discount / base) * 100 : 0;

  return {
    unit: finalUnit,
    discount,
    discount_percent,
    offer: {
      offer_id: offer.offer_id,
      rule_id: rule.rule_id,
      title: offer.title,
      description: offer.description,
      rule_type: offer.rule_type,
      discount_type: discountType,
      discount_value: toNumber(discountValue, 0),
      max_discount: offer.max_discount != null ? Number(offer.max_discount) : null,
    },
  };
}

module.exports = {
  applyOfferPricing,
};
