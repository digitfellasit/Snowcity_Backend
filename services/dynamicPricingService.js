const { pool } = require('../config/db');
const dynamicPricingModel = require('../models/dynamicPricing.model');
const attractionDatePricesModel = require('../models/attractionDatePrices.model');
const comboDatePricesModel = require('../models/comboDatePrices.model');

/**
 * Check if a given date is a weekday, weekend, or holiday
 */
function getDayType(date, holidays = []) {
  const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday

  // Check if it's a holiday
  const dateStr = date.toISOString().split('T')[0];
  if (holidays.includes(dateStr)) {
    return 'holiday';
  }

  // Check weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return 'weekend';
  }

  // Weekday
  return 'weekday';
}

/**
 * Check if a specific date matches the rule criteria
 */
function matchesDateRule(rule, date, time) {
  // Check specific date match
  if (rule.specific_date) {
    const ruleDate = new Date(rule.specific_date).toISOString().split('T')[0];
    const bookingDate = date.toISOString().split('T')[0];
    if (ruleDate !== bookingDate) {
      return false;
    }
  }

  // Check specific time match
  if (rule.specific_time) {
    const bookingTime = time.substring(0, 5); // HH:MM format
    const ruleTime = rule.specific_time.substring(0, 5); // HH:MM format
    if (ruleTime !== bookingTime) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a specific day matches the rule criteria
 */
function matchesDayRule(rule, date, holidays = []) {
  if (!rule.day_type) {
    return true; // No day restriction
  }

  const dayOfWeek = date.getDay();
  const dateStr = date.toISOString().split('T')[0];

  switch (rule.day_type) {
    case 'weekday':
      return dayOfWeek >= 1 && dayOfWeek <= 5; // Monday to Friday

    case 'weekend':
      return dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday

    case 'holiday':
      return holidays.includes(dateStr);

    case 'custom':
      return rule.specific_days && rule.specific_days.includes(dayOfWeek);

    default:
      return true;
  }
}

/**
 * Get applicable pricing rules for a specific attraction/combo on a given date
 */
async function getApplicableRules({ itemType, itemId, date, time, holidays = [] }) {
  const dateStr = date.toISOString().split('T')[0];
  const query = `
    SELECT 
      o.*,
      r.*,
      o.discount_type as offer_discount_type,
      o.discount_value as offer_discount_value
    FROM offers o
    JOIN offer_rules r ON o.offer_id = r.offer_id
    WHERE o.active = true
      AND o.valid_from <= $1
      AND (o.valid_to IS NULL OR o.valid_to >= $1)
      AND (
        (r.applies_to_all = true AND r.target_type = $2)
        OR (r.target_id = $3 AND r.target_type = $2)
      )
      AND (r.date_from IS NULL OR r.date_from <= $1)
      AND (r.date_to IS NULL OR r.date_to >= $1)
      AND (r.time_from IS NULL OR $4::time >= r.time_from)
      AND (r.time_to IS NULL OR $4::time <= r.time_to)
      AND (r.specific_date IS NULL OR r.specific_date = $1)
      AND (r.specific_time IS NULL OR $4::time = r.specific_time)
      AND (
        o.rule_type IN ('dynamic_pricing', 'date_slot_pricing', 'happy_hour', 'weekday_special')
        OR o.rule_type IS NULL
      )
    ORDER BY r.priority ASC, o.created_at DESC
  `;

  const { rows } = await pool.query(query, [dateStr, itemType, itemId, time]);

  // Filter rules based on day type and specific date/time matching
  return rows.filter(rule => {
    // First check specific date/time match
    if (!matchesDateRule(rule, date, time)) {
      return false;
    }

    // For happy hour rules, ensure time range is specified and matches
    if (rule.rule_type === 'happy_hour') {
      if (!rule.time_from || !rule.time_to) {
        return false; // Happy hour rules must have time ranges
      }
    }

    // Then check day type matching (for dynamic pricing and happy hour rules)
    if (rule.rule_type === 'dynamic_pricing' || rule.rule_type === 'happy_hour' || rule.rule_type === 'weekday_special') {
      return matchesDayRule(rule, date, holidays);
    }

    // For date_slot_pricing, only check specific date/time match
    return true;
  });
}

/**
 * Calculate dynamic price based on applicable rules
 */
async function calculateDynamicPrice({ itemType, itemId, basePrice, date, time, quantity = 1, holidays = [] }) {
  const dateStr = date.toISOString().split('T')[0];

  // Check for date-specific pricing first (overrides base price)
  let effectiveBasePrice = basePrice;
  let hasDateSpecificPrice = false;
  if (itemType === 'attraction') {
    const datePrice = await attractionDatePricesModel.getDatePrice(itemId, dateStr);
    if (datePrice) {
      effectiveBasePrice = Number(datePrice.price) || basePrice;
      hasDateSpecificPrice = true;
    }
  } else if (itemType === 'combo') {
    const datePrice = await comboDatePricesModel.getDatePrice(itemId, dateStr);
    if (datePrice) {
      effectiveBasePrice = Number(datePrice.price) || basePrice;
      hasDateSpecificPrice = true;
    }
  }

  // If a date-specific price exists, skip ALL offers (treat as dynamic pricing override)
  if (hasDateSpecificPrice) {
    return {
      originalPrice: effectiveBasePrice,
      finalPrice: effectiveBasePrice,
      discountAmount: 0,
      appliedRules: [{
        ruleId: null,
        ruleName: 'Date-Specific Price',
        adjustmentType: 'date_specific',
        adjustmentValue: effectiveBasePrice,
        adjustmentAmount: 0,
        type: 'dynamic_pricing_adjustment'
      }],
      totalPrice: effectiveBasePrice * quantity
    };
  }

  // First check if there are dynamic pricing rules for this date
  const dynamicPricingRules = await dynamicPricingModel.getApplicableRules(itemType, itemId, dateStr);

  if (dynamicPricingRules.length > 0) {
    // Apply dynamic pricing: calculate adjusted price from effective base price
    let finalPrice = effectiveBasePrice;
    const appliedRules = [];

    for (const rule of dynamicPricingRules) {
      let adjustment = 0;

      if (rule.price_adjustment_type === 'fixed') {
        adjustment = Number(rule.price_adjustment_value) || 0;
      } else if (rule.price_adjustment_type === 'percentage') {
        adjustment = (effectiveBasePrice * (Number(rule.price_adjustment_value) || 0)) / 100;
      }

      finalPrice += adjustment;

      appliedRules.push({
        ruleId: rule.rule_id,
        ruleName: rule.name,
        adjustmentType: rule.price_adjustment_type,
        adjustmentValue: rule.price_adjustment_value,
        adjustmentAmount: adjustment,
        type: 'dynamic_pricing_adjustment'
      });
    }

    // Ensure price doesn't go below 0
    finalPrice = Math.max(0, finalPrice);

    return {
      originalPrice: effectiveBasePrice,
      finalPrice,
      discountAmount: 0, // No discount, just adjustment
      appliedRules,
      totalPrice: finalPrice * quantity
    };
  }

  // No dynamic pricing rules, apply normal offers logic
  // But same-day bookings should NOT get offers — only future dates
  const todayStr = new Date().toISOString().slice(0, 10);
  if (dateStr <= todayStr) {
    return {
      originalPrice: effectiveBasePrice,
      finalPrice: effectiveBasePrice,
      discountAmount: 0,
      appliedRules: [],
      totalPrice: effectiveBasePrice * quantity
    };
  }

  const rules = await getApplicableRules({ itemType, itemId, date, time, holidays });

  if (!rules.length) {
    return {
      originalPrice: effectiveBasePrice,
      finalPrice: effectiveBasePrice,
      discountAmount: 0,
      appliedRules: [],
      totalPrice: effectiveBasePrice * quantity
    };
  }

  let finalPrice = effectiveBasePrice;
  let discountAmount = 0;
  const appliedRules = [];

  for (const rule of rules) {
    const discountType = rule.rule_discount_type || rule.offer_discount_type;
    const discountValue = Number(rule.rule_discount_value || rule.offer_discount_value) || 0;

    if (!discountType || discountValue === null || discountValue === 0) {
      continue;
    }

    let ruleDiscount = 0;

    if (discountType === 'percent') {
      ruleDiscount = (finalPrice * discountValue) / 100;
      // Apply max discount if specified
      if (rule.max_discount && ruleDiscount > rule.max_discount) {
        ruleDiscount = rule.max_discount;
      }
    } else if (discountType === 'amount') {
      ruleDiscount = discountValue;
    }

    // Apply the discount
    finalPrice = Math.max(0, finalPrice - ruleDiscount);
    discountAmount += ruleDiscount;

    appliedRules.push({
      ruleId: rule.rule_id,
      offerId: rule.offer_id,
      offerTitle: rule.title,
      discountType,
      discountValue,
      discountAmount: Number(ruleDiscount) || 0,
      dayType: rule.day_type,
      priority: rule.priority
    });

    // Stop if price reaches 0
    if (finalPrice <= 0) {
      break;
    }
  }

  return {
    originalPrice: effectiveBasePrice,
    finalPrice: Math.max(0, finalPrice),
    discountAmount: Number(discountAmount) || 0,
    appliedRules,
    totalPrice: Math.max(0, finalPrice) * quantity
  };
}

/**
 * Get holiday dates (this could be extended to fetch from a database table)
 */
async function getHolidays(year = new Date().getFullYear()) {
  // For now, return some common holidays
  // In a real implementation, this should fetch from a holidays table
  const commonHolidays = [
    `${year}-01-01`, // New Year
    `${year}-01-26`, // Republic Day (India)
    `${year}-08-15`, // Independence Day (India)
    `${year}-10-02`, // Gandhi Jayanti
    `${year}-12-25`, // Christmas
  ];

  // Could add dynamic holidays like Diwali, Eid, etc.

  return commonHolidays;
}

module.exports = {
  getDayType,
  matchesDayRule,
  getApplicableRules,
  calculateDynamicPrice,
  getHolidays
};
