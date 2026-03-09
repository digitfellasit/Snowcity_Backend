const couponsModel = require('../models/coupons.model');

async function getByCode(code, { activeOnly = true, onDate = null, attraction_id = null } = {}) {
  return couponsModel.getCouponByCode(code, { activeOnly, onDate, attraction_id });
}

async function applyCoupon({ code, items, onDate = null }) {
  const coupon = await couponsModel.getCouponByCode(code, { activeOnly: true, onDate });

  if (!coupon) {
    return { coupon: null, discount: 0, reason: 'coupon_not_found' };
  }

  // Calculate the eligible amount this coupon applies to
  let eligibleAmount = 0;

  if (coupon.attraction_id) {
    // Specific coupon - only applies to items matching the attraction_id
    eligibleAmount = items.reduce((acc, item) => {
      // For attractions: check attraction_id; for combos: check combo's attractions (skip for now, just check attraction_id)
      const isMatch = String(item.attraction_id) === String(coupon.attraction_id);
      if (isMatch) {
        return acc + (Number(item.price || 0) * Number(item.quantity || 1));
      }
      return acc;
    }, 0);
  } else {
    // Global coupon - applies to the whole cart
    eligibleAmount = items.reduce((acc, item) => {
      return acc + (Number(item.price || 0) * Number(item.quantity || 1));
    }, 0);
  }

  if (eligibleAmount <= 0) {
    return { coupon, discount: 0, reason: 'no_eligible_items' };
  }

  const { discount, reason } = await couponsModel.computeDiscount(coupon, eligibleAmount);
  return { coupon, discount, reason };
}

async function list({ active = null, attraction_id = null, date = null, q = '', limit = 50, offset = 0 } = {}) {
  return couponsModel.listCoupons({ active, attraction_id, date, q, limit, offset });
}

module.exports = {
  getByCode,
  applyCoupon,
  list,
};