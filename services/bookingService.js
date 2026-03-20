// services/bookingService.js
const { withTransaction, pool } = require('../config/db');
const bookingsModel = require('../models/bookings.model');
const attractionsModel = require('../models/attractions.model');
const addonsModel = require('../models/addons.model');
const couponsModel = require('../models/coupons.model');
const combosModel = require('../models/combos.model');
const attractionSlotsModel = require('../models/attractionSlots.model');
const comboSlotsModel = require('../models/comboSlots.model');
const { applyOfferPricing } = require('./offerPricing');
let offersModel = null;
let dynamicPricingService = null;
try {
  offersModel = require('../models/offers.model');
  dynamicPricingService = require('./dynamicPricingService');
} catch (_) { }

const { createOrder: rzpCreate, verifyPaymentSignature } = require('../config/razorpay');
const phonepe = require('../config/phonepe');
const payphiService = require('./payphiService');
const phonepeService = require('./phonepe.service');
const ticketService = require('./ticketService');
const ticketEmailService = require('./ticketEmailService');
const interaktService = require('./interaktService');
const { sendWhatsapp } = require('./twilioService');

const toNumber = (n, d = 0) => (Number.isFinite(Number(n)) ? Number(n) : d);
const coalescePositivePrice = (...values) => {
  for (const value of values) {
    if (value == null) continue;
    const num = toNumber(value, null);
    if (num != null && num > 0) return num;
  }
  return 0;
};
const isVirtualComboSlotId = (value) => typeof value === 'string' && value.includes('-');

const pad2 = (value) => String(Math.max(0, Number(value) || 0)).padStart(2, '0');
const parseTimeToMinutes = (time) => {
  if (!time || typeof time !== 'string') return null;
  const [h = '0', m = '0'] = time.split(':');
  const hours = Number(h);
  const minutes = Number(m);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};
const minutesToTime = (totalMinutes) => {
  if (!Number.isFinite(totalMinutes)) return null;
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  return `${pad2(hours)}:${pad2(mins)}:00`;
};
const splitSlotSegments = (startTime, endTime, segments) => {
  const result = Array.from({ length: Math.max(segments, 0) }, () => ({ start: null, end: null }));
  if (!segments || segments < 1) return result;
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) {
    return result;
  }

  const totalDuration = endMinutes - startMinutes;
  const baseSegment = Math.floor(totalDuration / segments);
  let remainder = totalDuration - baseSegment * segments;
  let cursor = startMinutes;

  for (let idx = 0; idx < segments; idx++) {
    let segmentMinutes = baseSegment;
    if (remainder > 0) {
      segmentMinutes += 1;
      remainder -= 1;
    }
    // ensure final segment closes gap
    if (idx === segments - 1) {
      segmentMinutes = endMinutes - cursor;
    }
    const next = cursor + Math.max(segmentMinutes, 0);
    result[idx] = {
      start: minutesToTime(cursor),
      end: minutesToTime(Math.min(next, endMinutes)),
    };
    cursor = next;
  }

  return result;
};

const formatSlotLabel = (start, end, fallback) => {
  if (!start || !end) return fallback || null;
  const toDisplay = (value) => {
    if (!value) return '';
    const [hours = '0', minutes = '0'] = value.split(':');
    const h = Number(hours);
    if (!Number.isFinite(h)) return value;
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return `${hour12}:${minutes} ${period}`;
  };
  return `${toDisplay(start)} - ${toDisplay(end)}`;
};

const buildComboAttractions = (combo = {}) => {
  const entries = [];
  if (Array.isArray(combo.attractions) && combo.attractions.length) {
    combo.attractions.forEach((attr, idx) => {
      const id = attr?.attraction_id ?? combo.attraction_ids?.[idx] ?? attr?.id;
      if (!id) return;
      const priceSources = [
        attr?.attraction_price,
        attr?.price,
        Array.isArray(combo.attraction_prices) ? combo.attraction_prices[idx] : null,
        combo.attraction_prices?.[id],
        combo.attraction_prices?.[String(id)],
      ];
      const price = toNumber(priceSources.find((val) => val != null), 0);
      entries.push({
        attraction_id: Number(id),
        price,
        title: attr?.title || attr?.name || `Attraction ${id}`,
        position: attr?.position_in_combo ?? idx + 1,
      });
    });
  } else if (Array.isArray(combo.attraction_ids)) {
    combo.attraction_ids.forEach((id, idx) => {
      if (!id) return;
      const priceSources = [
        Array.isArray(combo.attraction_prices) ? combo.attraction_prices[idx] : null,
        combo.attraction_prices?.[id],
        combo.attraction_prices?.[String(id)],
      ];
      const price = toNumber(priceSources.find((val) => val != null), 0);
      entries.push({ attraction_id: Number(id), price, title: `Attraction ${id}`, position: idx + 1 });
    });
  }
  return entries.sort((a, b) => a.position - b.position);
};

async function createComboChildBookings({ client, comboBooking, comboDetails, baseItem, orderId, userId, dynamicChildPrices }) {
  const combo = comboDetails || (comboBooking?.combo_id ? await combosModel.getComboById(comboBooking.combo_id) : null);
  if (!combo) return;
  const attractions = buildComboAttractions(combo);
  if (!attractions.length) return;

  const segmentTimes = splitSlotSegments(comboBooking.slot_start_time, comboBooking.slot_end_time, attractions.length);
  const paymentStatus = comboBooking.payment_status || 'Pending';
  const bookingStatus = comboBooking.booking_status || 'Booked';
  const comboSlotId = comboBooking.combo_slot_id || null;
  const bookingDate = comboBooking.booking_date || baseItem.booking_date;
  const quantity = Math.max(1, Number(baseItem.quantity || comboBooking.quantity || 1));
  const ticketQuantity = Math.max(1, Number(quantity || 1));
  const parentTotal = toNumber(comboBooking.total_amount, 0);

  // Build a map of dynamic child prices if available
  const childPriceMap = dynamicChildPrices && typeof dynamicChildPrices === 'object' ? dynamicChildPrices : {};

  for (let idx = 0; idx < attractions.length; idx++) {
    const entry = attractions[idx];
    const targetId = entry?.attraction_id;
    if (!targetId) continue;

    // Prefer dynamic child price over static combo price
    const dynamicPrice = toNumber(childPriceMap[String(targetId)], null);
    const explicitPrice = entry.price;
    const fallbackPerTicket = quantity > 0 && attractions.length > 0
      ? parentTotal / attractions.length / quantity
      : 0;
    const unitPrice = dynamicPrice != null && dynamicPrice > 0
      ? dynamicPrice
      : (toNumber(explicitPrice, 0) || Math.max(0, fallbackPerTicket));
    const totalAmount = unitPrice * ticketQuantity;
    const discountAmount = 0;
    const times = segmentTimes[idx] || {};
    const slotStart = times.start || comboBooking.slot_start_time || null;
    const slotEnd = times.end || comboBooking.slot_end_time || null;
    const slotLabel = formatSlotLabel(slotStart, slotEnd, entry.title) || comboBooking.slot_label || entry.title;

    await client.query(
      `INSERT INTO bookings
        (order_id, user_id, item_type, attraction_id, combo_id, slot_id, combo_slot_id,
         offer_id, quantity, booking_date, total_amount, discount_amount, payment_status,
         slot_start_time, slot_end_time, slot_label, parent_booking_id, booking_status)
       VALUES ($1, $2, 'Attraction', $3, NULL, NULL, $4,
         $5, $6, $7, $8, $9, $10,
         $11::time, $12::time, $13, $14, $15)
       RETURNING booking_id`,
      [
        orderId,
        userId,
        targetId,
        comboSlotId,
        baseItem.offer_id || null,
        ticketQuantity,
        bookingDate,
        totalAmount,
        discountAmount,
        paymentStatus,
        slotStart,
        slotEnd,
        slotLabel,
        comboBooking.booking_id,
        bookingStatus,
      ]
    );
  }
}

// -------- Offer pricing with dynamic day-based pricing --------
async function applyOfferRule({ targetType, targetId, slotType, slotId, booking_date, booking_time, basePrice }) {
  if (!offersModel) {
    return { unit: basePrice, discount: 0, offer: null };
  }

  // Primary: use unified offers model (happy hour, date slots, etc.)
  const match = await offersModel.findApplicableOfferRule({
    targetType,
    targetId,
    slotType,
    slotId,
    date: booking_date,
    time: booking_time,
  });
  if (match) {
    const { offer, rule } = match;
    let discountType = rule?.rule_discount_type || offer.discount_type || (offer.discount_percent ? 'percent' : null);
    let discountValue = rule?.rule_discount_value ?? offer.discount_value ?? offer.discount_percent ?? 0;
    if (!discountType || !discountValue) {
      return { unit: basePrice, discount: 0, offer: null };
    }

    discountType = String(discountType).toLowerCase();
    let discount = discountType === 'amount'
      ? Number(discountValue)
      : (Number(discountValue) / 100) * basePrice;

    if (offer.max_discount != null) {
      discount = Math.min(discount, Number(offer.max_discount));
    }
    discount = Math.min(discount, basePrice);

    const finalUnit = toNumber(basePrice - discount, 0);
    return {
      unit: finalUnit,
      discount: toNumber(discount, 0),
      offer: {
        offer_id: offer.offer_id,
        rule_id: rule.rule_id,
        title: offer.title,
        discount_type: discountType,
        discount_value: Number(discountValue),
      },
    };
  }

  // Fallback: try legacy dynamicPricingService if present
  if (dynamicPricingService) {
    try {
      const holidays = await dynamicPricingService.getHolidays(new Date(booking_date).getFullYear());
      const pricingResult = await dynamicPricingService.calculateDynamicPrice({
        itemType: targetType,
        itemId: targetId,
        basePrice,
        date: new Date(booking_date),
        time: booking_time,
        quantity: 1,
        holidays,
      });

      if (pricingResult.appliedRules.length > 0) {
        const firstRule = pricingResult.appliedRules[0];
        return {
          unit: pricingResult.finalPrice,
          discount: pricingResult.discountAmount,
          offer: {
            offer_id: firstRule.offerId,
            rule_id: firstRule.ruleId,
            title: firstRule.offerTitle,
            discount_type: firstRule.discountType,
            discount_value: firstRule.discountValue,
            appliedRules: pricingResult.appliedRules,
          },
        };
      }
    } catch (err) {
      console.error('Dynamic pricing error:', err);
    }
  }

  return { unit: basePrice, discount: 0, offer: null };
}

// -------- Pricing helpers --------
async function priceFromAttraction(attraction_id) {
  const a = await attractionsModel.getAttractionById(attraction_id);
  if (!a) { const e = new Error('Attraction not found'); e.status = 404; throw e; }
  return { base: toNumber(a.base_price ?? a.price ?? a.amount, 0) };
}
async function priceFromAttractionSlot(slot_id) {
  if (!slot_id || !attractionSlotsModel?.getSlotById) return { slotPrice: null };
  try {
    const s = await attractionSlotsModel.getSlotById(slot_id);
    return { slotPrice: toNumber(s?.price ?? s?.amount, null) };
  } catch { return { slotPrice: null }; }
}
async function priceFromCombo(combo_id) {
  const c = await combosModel.getComboById(combo_id);
  if (!c) { const e = new Error('Combo not found'); e.status = 404; throw e; }
  return {
    base: coalescePositivePrice(
      c.combo_price,
      c.price,
      c.amount,
      c.total_price,
      c.starting_price,
      c.min_price,
      c.base_price
    ),
    combo: c
  };
}

async function priceFromComboSlot(combo_slot_id) {
  if (!combo_slot_id) return { slotPrice: null };

  // First try to get from database
  try {
    const slot = await comboSlotsModel.getSlotById(combo_slot_id);
    if (slot && slot.price != null) {
      return { slotPrice: toNumber(slot.price, null) };
    }
  } catch (err) {
    console.log('Combo slot not found in DB, trying dynamic generation:', err.message);
  }

  // If not found in DB, try to parse virtual slot ID and generate dynamically
  if (typeof combo_slot_id === 'string' && combo_slot_id.includes('-')) {
    try {
      const parts = combo_slot_id.split('-');
      if (parts.length >= 3) {
        // Format: combo_id-date-hour (e.g., 4-20251204-10)
        const comboId = parts[0];
        const dateStr = parts[1];
        const hour = parts[2];

        // Get combo details to get the price
        const combo = await combosModel.getComboById(comboId);
        if (combo) {
          const slotPrice = coalescePositivePrice(
            combo.combo_price,
            combo.price,
            combo.amount,
            combo.total_price,
            combo.starting_price,
            combo.min_price,
            combo.base_price
          );
          console.log('🔍 DEBUG: Got combo price from dynamic slot:', {
            comboId,
            dateStr,
            hour,
            slotPrice,
            comboPrice: combo.combo_price,
            totalPrice: combo.total_price
          });
          return { slotPrice: slotPrice > 0 ? slotPrice : null };
        }
      }
    } catch (err) {
      console.error('Error parsing virtual combo slot ID:', err);
    }
  }

  return { slotPrice: null };
}
async function resolveSubjectIds(item = {}) {
  const out = { ...item };
  const type = item.item_type || (item.combo_id ? 'Combo' : 'Attraction');
  if (type === 'Attraction' && (!item.attraction_id || item.attraction_id === null) && item.slot_id && attractionSlotsModel?.getSlotById) {
    try {
      const s = await attractionSlotsModel.getSlotById(item.slot_id);
      if (s?.attraction_id) out.attraction_id = Number(s.attraction_id);
    } catch { }
  }
  if (type === 'Combo' && (!item.combo_id || item.combo_id === null) && item.combo_slot_id && comboSlotsModel?.getSlotById) {
    try {
      const s = await comboSlotsModel.getSlotById(item.combo_slot_id);
      if (s?.combo_id) out.combo_id = Number(s.combo_id);
    } catch { }
  }
  return out;
}
async function normalizeAddons(addons = []) {
  let addonsTotal = 0;
  const normalized = [];
  for (const a of addons) {
    if (!a || a.addon_id == null) continue;
    const row = await addonsModel.getAddonById(a.addon_id);
    if (!row) continue;
    const qty = Math.max(1, toNumber(a.quantity ?? a.qty, 1));
    const unitBase = toNumber(row.price ?? row.amount, 0);
    const unit = unitBase * (1 - toNumber(row.discount_percent, 0) / 100);
    addonsTotal += unit * qty;
    normalized.push({ addon_id: row.addon_id, quantity: qty, price: unit });
  }
  return { addonsTotal, normalized };
}
async function discountFromCoupon(coupon_code, total, onDate) {
  if (!coupon_code) return { discount: 0, coupon: null };
  const coupon = await couponsModel.getCouponByCode(coupon_code, { activeOnly: true, onDate });
  const disc = await couponsModel.computeDiscount(coupon, total);
  return { discount: toNumber(disc?.discount ?? disc?.amount, 0), coupon };
}
// -------- Totals (per item) --------
async function computeTotals(item = {}) {
  const item_type = item.item_type || (item.combo_id ? 'Combo' : 'Attraction');
  const qty = Math.max(1, toNumber(item.quantity ?? 1, 1));
  const onDate = item.booking_date || new Date().toISOString().slice(0, 10);

  let baseUnit = 0;
  let slotType = null;
  let slotId = null;
  let comboDetails = null;
  if (item_type === 'Combo') {
    const { base, combo } = await priceFromCombo(item.combo_id);
    const { slotPrice } = await priceFromComboSlot(item.combo_slot_id);
    baseUnit = slotPrice != null ? slotPrice : base;
    comboDetails = combo || null;
    if (item.combo_slot_id) {
      slotType = 'combo';
      slotId = item.combo_slot_id;
    }
  } else {
    const { base } = await priceFromAttraction(item.attraction_id);
    const { slotPrice } = await priceFromAttractionSlot(item.slot_id);
    baseUnit = slotPrice != null ? slotPrice : base;
    if (item.slot_id) {
      slotType = 'attraction';
      slotId = item.slot_id;
    }
  }

  console.log('🔍 computeTotals STEP 1 - Base prices:', {
    item_type, qty, baseUnit,
    attraction_id: item.attraction_id,
    combo_id: item.combo_id,
    slot_id: item.slot_id,
  });

  const effectiveSlotId = slotType === 'combo' && isVirtualComboSlotId(slotId) ? null : slotId;

  let unit = baseUnit;
  let unitDiscount = 0;
  let offer = null;
  let offerId = null;

  // Offer logic: applies for advance bookings OR same-day if rule is dynamic_pricing
  const todayStr = new Date().toISOString().slice(0, 10);

  // Try dynamic pricing service first
  let appliedDynamic = false;
  if (dynamicPricingService && dynamicPricingService.calculateDynamicPrice) {
    try {
      // Calculate dynamic price (adjustments + discounts)
      const pricingResult = await dynamicPricingService.calculateDynamicPrice({
        itemType: item_type === 'Combo' ? 'combo' : 'attraction',
        itemId: item_type === 'Combo' ? item.combo_id : item.attraction_id,
        basePrice: baseUnit,
        date: new Date(item.booking_date),
        time: item.slot_start_time || item.slotStartTime || item.booking_time || null,
        quantity: 1, // Calculate per-unit price
      });

      console.log('🔍 computeTotals STEP 2 - Dynamic pricing result:', {
        originalPrice: pricingResult.originalPrice,
        finalPrice: pricingResult.finalPrice,
        discountAmount: pricingResult.discountAmount,
        appliedRules: pricingResult.appliedRules?.length || 0,
      });

      // CRITICAL: cast to Number — dynamicPricingService can return strings
      // e.g. discountAmount = '0100.00' which causes string concatenation
      unit = Number(pricingResult.finalPrice) || 0;
      unitDiscount = Number(pricingResult.discountAmount) || 0;

      const dynamicBase = unit + unitDiscount;
      baseUnit = dynamicBase;

      if (pricingResult.appliedRules && pricingResult.appliedRules.length > 0) {
        const offerRule = pricingResult.appliedRules.find(r => r.offerId);
        offerId = offerRule ? offerRule.offerId : null;

        offer = {
          offer_id: offerId,
          title: pricingResult.appliedRules.map(r => r.offerTitle || r.ruleName).filter(Boolean).join(', '),
          applied_rules: pricingResult.appliedRules,
          discount_value: unitDiscount,
        };
      }
      appliedDynamic = true;
    } catch (err) {
      console.error('Dynamic pricing calculation failed in bookingService, falling back:', err);
    }
  }

  // Fallback to legacy offer pricing if dynamic failed or service missing/not applied
  if (!appliedDynamic) {
    const pricing = await applyOfferPricing({
      targetType: item_type === 'Combo' ? 'combo' : 'attraction',
      targetId: item_type === 'Combo' ? item.combo_id : item.attraction_id,
      slotType,
      slotId: effectiveSlotId,
      baseAmount: baseUnit,
      booking_date: item.booking_date,
      booking_time: item.slot_start_time || item.slotStartTime || item.booking_time || null,
    });
    unit = pricing.unit;
    unitDiscount = pricing.discount;
    offer = pricing.offer;
    offerId = pricing.offer?.offer_id || null;
  }

  const ticketsTotal = unit * qty;
  const baseTicketsTotal = baseUnit * qty;
  const offerDiscountTotal = unitDiscount * qty;

  const { addonsTotal, normalized } = await normalizeAddons(item.addons || []);
  const preDiscount = baseTicketsTotal + addonsTotal;

  const discount_amount = Math.max(0, offerDiscountTotal);
  // If offerDiscountTotal is negative, it represents a price increase (surcharge)
  // We add the absolute value of the surcharge to the gross total
  const surcharge = Math.max(0, -offerDiscountTotal);
  const total_amount = preDiscount + surcharge; // Adjusted Gross
  const final_amount = Math.max(0, total_amount - discount_amount); // Net

  console.log('🔍 computeTotals FINAL:', {
    baseUnit, unit, unitDiscount, qty,
    ticketsTotal, baseTicketsTotal, offerDiscountTotal, addonsTotal,
    total_amount, discount_amount, final_amount,
    appliedDynamic,
  });

  return {
    quantity: qty,
    booking_date: onDate,
    total_amount,   // Gross
    discount_amount,
    final_amount,   // Net
    addons: normalized,
    base_unit_price: baseUnit,
    unit_price: unit,
    unit_discount: unitDiscount,
    offer: offer,
    offer_id: offerId,
    combo_details: comboDetails,
  };
}

// -------- Totals (Multi - Helper) --------
async function computeTotalsMulti(items = []) {
  const out = [];
  for (const it of items) out.push(await computeTotals(it || {}));
  return out;
}

// -------- Capacity lock --------
async function lockCapacityIfNeeded(client, item) {
  const item_type = item.item_type || (item.combo_id ? 'Combo' : 'Attraction');
  if (item_type === 'Attraction' && item.slot_id && attractionSlotsModel?.assertCapacityAndLock) {
    await attractionSlotsModel.assertCapacityAndLock(client, item.slot_id);
  } else if (
    item_type === 'Combo' &&
    item.combo_slot_id &&
    !isVirtualComboSlotId(item.combo_slot_id) &&
    comboSlotsModel?.assertCapacityAndLock
  ) {
    await comboSlotsModel.assertCapacityAndLock(client, item.combo_slot_id);
  }
}

// -------- Create (Multi-Item Order) --------
async function createBookings(payload) {
  const items = Array.isArray(payload) ? payload : [payload];
  if (!items.length) {
    const e = new Error('No items provided'); e.status = 400; throw e;
  }

  // 1. Compute totals for all items
  let grossBeforeDiscount = 0;
  let offerDiscountTotal = 0;

  const processedItems = [];
  const globalCouponCode = items[0]?.coupon_code || null; // Assume single coupon for cart
  const userId = items[0]?.user_id || null;
  const onDate = items[0]?.booking_date || new Date().toISOString().slice(0, 10);

  // Pre-calculation loop
  for (const item of items) {
    const normalized = await resolveSubjectIds(item);

    // Stop-booking guard: check if attraction or combo has booking stopped
    const itemType = normalized.item_type || (normalized.combo_id ? 'Combo' : 'Attraction');
    if (itemType === 'Combo' && normalized.combo_id) {
      const combo = await combosModel.getComboById(normalized.combo_id);
      if (combo && combo.stop_booking) {
        const e = new Error(`Booking is temporarily unavailable for "${combo.name || 'this combo'}"`);
        e.status = 400;
        throw e;
      }
    } else if (normalized.attraction_id) {
      const attraction = await attractionsModel.getAttractionById(normalized.attraction_id);
      if (attraction && attraction.stop_booking) {
        const e = new Error(`Booking is temporarily unavailable for "${attraction.title || 'this attraction'}"`);
        e.status = 400;
        throw e;
      }
    }

    const lineTotals = await computeTotals(normalized);
    grossBeforeDiscount += lineTotals.total_amount;
    offerDiscountTotal += lineTotals.discount_amount;
    processedItems.push({ ...normalized, ...lineTotals });
  }

  // 2. Apply Global Cart Coupon
  let globalCouponDiscount = 0;
  let applySpecificCoupon = false;
  let specificAttractionId = null;

  if (globalCouponCode) {
    const coupon = await couponsModel.getCouponByCode(globalCouponCode, { activeOnly: true, onDate });
    if (coupon) {
      if (coupon.attraction_id) {
        applySpecificCoupon = true;
        specificAttractionId = String(coupon.attraction_id);

        let eligibleAmount = 0;
        for (const pItem of processedItems) {
          const isMatch = pItem.item_type !== 'Combo' && String(pItem.attraction_id) === specificAttractionId;
          if (isMatch) {
            eligibleAmount += pItem.total_amount;
          }
        }

        if (eligibleAmount > 0) {
          const disc = await couponsModel.computeDiscount(coupon, eligibleAmount);
          globalCouponDiscount = Number(disc?.discount ?? disc?.amount ?? 0);
        }
      } else {
        // Global coupon
        const { discount } = await discountFromCoupon(globalCouponCode, Math.max(grossBeforeDiscount - offerDiscountTotal, 0), onDate);
        globalCouponDiscount = discount;
      }
    }
  }

  const grandTotalDiscount = offerDiscountTotal + globalCouponDiscount;

  // Prepare distribution of coupon discount to child items
  let remainingCouponDiscount = globalCouponDiscount;

  // 3. Perform DB Transaction
  return withTransaction(async (client) => {
    // A. Set current user for trigger if provided
    const performedBy = items[0]?.performedBy || null;
    if (performedBy) {
      await client.query(`SELECT set_config('app.current_user', $1, true)`, [performedBy]);
    }

    // B. Create Parent Order
    const orderRes = await client.query(
      `INSERT INTO orders 
           (user_id, total_amount, discount_amount, payment_mode, coupon_code, payment_status)
           VALUES ($1, $2, $3, 'Online', $4, 'Pending')
           RETURNING *`,
      [userId, grossBeforeDiscount, grandTotalDiscount, globalCouponCode]
    );
    const order = orderRes.rows[0];
    const orderId = order.order_id;

    // B. Create Child Bookings
    const bookings = [];

    for (const pItem of processedItems) {
      await lockCapacityIfNeeded(client, pItem);

      const isCombo = pItem.item_type === 'Combo' || (pItem.combo_id && !pItem.attraction_id);
      const itemType = isCombo ? 'Combo' : 'Attraction';
      if (itemType === 'Attraction' && (pItem.attraction_id == null)) { const e = new Error('Invalid booking: attraction_id is required'); e.status = 400; throw e; }
      if (itemType === 'Combo' && (pItem.combo_id == null)) { const e = new Error('Invalid booking: combo_id is required'); e.status = 400; throw e; }

      // Strict ID assignment
      const attractionId = isCombo ? null : (pItem.attraction_id || null);
      const comboId = isCombo ? (pItem.combo_id || null) : null;
      const slotId = isCombo ? null : (pItem.slot_id || null);
      const rawComboSlotId = isCombo ? (pItem.combo_slot_id ?? null) : null;
      const comboSlotId = rawComboSlotId && isVirtualComboSlotId(rawComboSlotId)
        ? null
        : rawComboSlotId;
      const comboDetails = pItem.combo_details;


      const slotStart = pItem.slot_start_time || null;
      const slotEnd = pItem.slot_end_time || null;
      const slotLabel = pItem.slot_label || null;

      console.log('🔍 DEBUG createBookings inserting slot timing:', {
        booking_date: pItem.booking_date,
        slotStart,
        slotEnd,
        slotLabel,
        rawItemSlotStart: pItem.slot_start_time,
        rawItemSlotEnd: pItem.slot_end_time,
        itemType,
        attractionId,
        comboId,
        slotId,
        comboSlotId,
        rawComboSlotId
      });

      // Compute distributed coupon discount for this item
      let currentItemCouponDiscount = 0;
      if (globalCouponDiscount > 0 && remainingCouponDiscount > 0) {
        if (applySpecificCoupon) {
          const isMatch = pItem.item_type !== 'Combo' && String(pItem.attraction_id) === specificAttractionId;
          if (isMatch) {
            // Calculate proportion of the eligible items ONLY
            let totalEligible = 0;
            for (const pi of processedItems) {
              if (pi.item_type !== 'Combo' && String(pi.attraction_id) === specificAttractionId) {
                totalEligible += pi.total_amount;
              }
            }
            if (totalEligible > 0) {
              const ratio = pItem.total_amount / totalEligible;
              // Avoid rounding errors on the last item
              currentItemCouponDiscount = Math.min(
                remainingCouponDiscount,
                Math.round((globalCouponDiscount * ratio) * 100) / 100
              );
            }
          }
        } else {
          // Global cart coupon, distribute proportionally to all items
          const ratio = pItem.total_amount / grossBeforeDiscount;
          currentItemCouponDiscount = Math.min(
            remainingCouponDiscount,
            Math.round((globalCouponDiscount * ratio) * 100) / 100
          );
        }

        // Final item adjustment
        if (processedItems.indexOf(pItem) === processedItems.length - 1 && remainingCouponDiscount > 0) {
          // If last eligible item, dump the rest to handle rounding
          if (!applySpecificCoupon || (pItem.item_type !== 'Combo' && String(pItem.attraction_id) === specificAttractionId)) {
            currentItemCouponDiscount = remainingCouponDiscount;
          }
        }

        remainingCouponDiscount -= currentItemCouponDiscount;
      }

      const finalItemDiscount = (pItem.discount_amount || 0) + currentItemCouponDiscount;

      const bRes = await client.query(
        `INSERT INTO bookings 
               (order_id, user_id, item_type, attraction_id, combo_id, slot_id, combo_slot_id,
                offer_id, quantity, booking_date, total_amount, discount_amount, payment_status,
                slot_start_time, slot_end_time, slot_label, booking_status)
               VALUES ($1, $2, $3::booking_item_type, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'Pending', $13, $14, $15, 'PENDING_PAYMENT')
               RETURNING *`,
        [
          orderId, userId, itemType, attractionId, comboId, slotId, comboSlotId,
          pItem.offer_id || null, pItem.quantity, pItem.booking_date,
          pItem.total_amount, finalItemDiscount,
          slotStart, slotEnd, slotLabel
        ]
      );
      const booking = bRes.rows[0];

      // Insert Addons
      for (const a of pItem.addons) {
        await client.query(
          `INSERT INTO booking_addons(booking_id, addon_id, quantity, price)
      VALUES($1, $2, $3, $4)`,
          [booking.booking_id, a.addon_id, a.quantity, a.price]
        );
      }
      bookings.push(booking);

      if (isCombo) {
        // Extract dynamic child_price_adjustments from applied rules if available
        let dynamicChildPrices = null;
        if (pItem.offer?.applied_rules) {
          const childRule = pItem.offer.applied_rules.find(r => r.childPriceAdjustments);
          if (childRule) dynamicChildPrices = childRule.childPriceAdjustments;
        }
        await createComboChildBookings({
          client,
          comboBooking: booking,
          comboDetails: pItem.combo_details,
          baseItem: pItem,
          orderId,
          userId,
          dynamicChildPrices,
        });
      }
    }

    return { order_id: orderId, order_ref: order.order_ref, order, bookings };
  });
}

// Legacy alias
const createBooking = createBookings;

// -------- Payment & Status --------

async function initiatePayPhiPayment({ bookingId, email, mobile, amount: frontendAmount }) {
  // bookingId here is the identifier from the URL (:id)
  const identifier = bookingId;
  const isNumeric = /^\d+$/.test(String(identifier));

  const orderRes = isNumeric
    ? await pool.query(`SELECT * FROM orders WHERE order_id = $1`, [parseInt(identifier)])
    : await pool.query(`SELECT * FROM orders WHERE order_ref = $1`, [identifier]);

  if (!orderRes.rows.length) { const e = new Error('Order not found'); e.status = 404; throw e; }
  const order = orderRes.rows[0];
  const orderId = order.order_id;

  if (order.payment_status === 'Completed') {
    const e = new Error('Payment already completed'); e.status = 400; throw e;
  }

  // Generate unique merchantTxnNo for each payment attempt to avoid duplicates
  const merchantTxnNo = `${order.order_ref}_${Date.now()}`;

  // Use the frontend-supplied amount as the authoritative payment amount.
  // The frontend calculates from the same price sources and has been verified correct.
  const amount = Number(frontendAmount);

  // Log for verification / debugging
  const dbTotal = Number(order.total_amount || 0);
  const dbDiscount = Number(order.discount_amount || 0);
  console.log('💰 PayPhi Payment Amount:', {
    frontendAmount: amount,
    dbTotal,
    dbDiscount,
    dbFinalAmount: order.final_amount,
    orderRef: order.order_ref,
    orderId,
  });

  if (!amount || amount <= 0) {
    const e = new Error('Order total must be greater than zero to initiate payment');
    e.status = 400;
    throw e;
  }

  const { redirectUrl, tranCtx, raw } = await payphiService.initiate({
    merchantTxnNo,
    amount,
    customerEmailID: email,
    customerMobileNo: mobile,
    addlParam1: String(order.order_ref),
    addlParam2: 'GroupOrder'
  });

  if (tranCtx) {
    await pool.query(
      `UPDATE orders SET payment_ref = $1, payment_txn_no = $2, payment_mode = 'PayPhi' WHERE order_id = $3`,
      [tranCtx, merchantTxnNo, orderId]
    );
  }

  const responseCode = raw?.responseCode || raw?.respCode || raw?.code || raw?.response?.responseCode || null;
  const responseMessage = raw?.responseMessage || raw?.respMessage || raw?.message || raw?.response?.responseMessage || null;

  return { redirectUrl, tranCtx, responseCode, responseMessage, response: raw };
}

async function checkPayPhiStatus(orderIdOrRef) {
  const isNumeric = /^\d+$/.test(String(orderIdOrRef));
  const orderRes = isNumeric
    ? await pool.query(`SELECT * FROM orders WHERE order_id = $1`, [parseInt(orderIdOrRef)])
    : await pool.query(`SELECT * FROM orders WHERE order_ref = $1`, [orderIdOrRef]);

  if (!orderRes.rows.length) { const e = new Error('Order not found'); e.status = 404; throw e; }
  const order = orderRes.rows[0];

  const merchantTxnNo = order.payment_txn_no || order.order_ref;
  const originalTxnNo = order.payment_txn_no || order.order_ref;

  const { success, raw } = await payphiService.status({
    merchantTxnNo, originalTxnNo, amount: order.final_amount
  });

  console.log('🔍 DEBUG PayPhi Status Check:', {
    orderRef: order.order_ref,
    orderId: order.order_id,
    merchantTxnNo,
    success,
    raw
  });

  // Determine the actual status from PayPhi response
  // PayPhi responseCode/transactionStatus values:
  //   Success: R1000, SUCCESS, 000, CAPTURED
  //   Failed:  R1001, R1002, FAILED, DECLINED, ERROR, CANCELLED
  //   Pending: anything else (no explicit success or failure)
  const rawCode = String(raw?.responseCode || raw?.respCode || raw?.txnResponseCode || '').toUpperCase();
  const rawTxnCode = String(raw?.txnResponseCode || '').toUpperCase();
  const rawStatus = String(raw?.transactionStatus || raw?.status || raw?.txnStatus || '').toUpperCase();

  const isExplicitFail = ['FAILED', 'DECLINED', 'ERROR', 'CANCELLED', 'REJECTED', 'REJ'].includes(rawStatus)
    || ['R1001', 'R1002', 'R1003', 'R1004', 'R1005'].includes(rawCode)
    || rawStatus === 'FAIL'
    || (rawTxnCode && rawTxnCode !== '000' && rawTxnCode !== '0000');

  // ── SUCCESS: update DB to Completed + CONFIRMED ──
  if (success && order.payment_status !== 'Completed') {
    const payphiTxnID = raw?.txnID || raw?.txnId || raw?.transactionId || raw?.transactionValue ||
      raw?.data?.transactionId || raw?.response?.transactionId || null;
    const finalMerchantTxnNo = raw?.merchantTxnNo || merchantTxnNo;

    console.log('🔍 DEBUG PayPhi Updating Payment Status:', {
      orderRef: order.order_ref,
      orderId: order.order_id,
      payphiTxnID,
      finalMerchantTxnNo,
      status: 'Completed'
    });

    await withTransaction(async (client) => {
      // paymentMode/paymentType from PayPhi (e.g. UPI, CC, DC, NB)
      const paymentMethod = raw?.paymentMode || raw?.paymentType || raw?.payType || null;
      // txnDate or paymentDateTime from PayPhi (e.g. 20260310125738)
      const paymentDateTime = raw?.paymentDateTime || raw?.txnDate || raw?.txnDateTime || null;

      // Update Order
      await client.query(
        `UPDATE orders SET payment_status = 'Completed', payment_ref = $1, payment_txn_no = $2, payment_mode = 'PayPhi', payment_method = $3, payment_datetime = $4, updated_at = NOW() WHERE order_id = $5`,
        [finalMerchantTxnNo, payphiTxnID, paymentMethod, paymentDateTime, order.order_id]
      );

      // Update Bookings
      await client.query(
        `UPDATE bookings SET payment_status = 'Completed', payment_ref = $1, payment_txn_no = $2, payment_mode = 'PayPhi', payment_method = $3, payment_datetime = $4, booking_status = 'CONFIRMED', updated_at = NOW() WHERE order_id = $5`,
        [finalMerchantTxnNo, payphiTxnID, paymentMethod, paymentDateTime, order.order_id]
      );
    });

    // Generate and store ticket in S3
    try {
      const bRes = await pool.query('SELECT booking_id FROM bookings WHERE order_id = $1 LIMIT 1', [order.order_id]);
      if (bRes.rows.length > 0) {
        const ticketUrl = await ticketService.generateTicket(bRes.rows[0].booking_id);
        await pool.query('UPDATE bookings SET ticket_pdf = $1 WHERE order_id = $2', [ticketUrl, order.order_id]);
      }
    } catch (err) {
      console.error('Failed to generate/store ticket in S3 after PayPhi payment', err);
    }

    // Send single combined email for the entire order
    try {
      await ticketEmailService.sendOrderEmail(order.order_id);
    } catch (err) {
      console.error('Failed to send order email', err);
    }

    // Send WhatsApp ticket for the entire order
    try {
      await interaktService.sendTicketForOrder(order.order_id, { force: true });
    } catch (err) {
      console.error('Failed to send WhatsApp ticket for order', err);
    }

    return { success: true, status: 'COMPLETED', response: raw };
  }

  // ── Already completed — no-op ──
  if (order.payment_status === 'Completed') {
    return { success: true, status: 'COMPLETED', response: raw };
  }

  // ── EXPLICIT FAILURE: Update DB to Failed & Cancelled ──
  if (isExplicitFail && order.payment_status !== 'Failed') {
    const payphiTxnID = raw?.txnID || raw?.txnId || raw?.transactionId || raw?.transactionValue ||
      raw?.data?.transactionId || raw?.response?.transactionId || null;
    const finalMerchantTxnNo = raw?.merchantTxnNo || merchantTxnNo;

    console.log('🔍 DEBUG PayPhi Payment FAILED:', {
      orderRef: order.order_ref,
      orderId: order.order_id,
      rawCode,
      rawStatus,
      payphiTxnID,
      finalMerchantTxnNo
    });

    await withTransaction(async (client) => {
      const paymentMethod = raw?.paymentMode || raw?.paymentType || raw?.payType || null;
      const paymentDateTime = raw?.paymentDateTime || raw?.txnDate || raw?.txnDateTime || null;

      // Update Order
      await client.query(
        `UPDATE orders SET payment_status = 'Failed', payment_ref = $1, payment_txn_no = $2, payment_mode = 'PayPhi', payment_method = $3, payment_datetime = $4, updated_at = NOW() WHERE order_id = $5`,
        [finalMerchantTxnNo, payphiTxnID, paymentMethod, paymentDateTime, order.order_id]
      );

      // Update Bookings — mark as Cancelled
      await client.query(
        `UPDATE bookings SET payment_status = 'Failed', booking_status = 'Cancelled', payment_ref = $1, payment_txn_no = $2, payment_mode = 'PayPhi', payment_method = $3, payment_datetime = $4, updated_at = NOW() WHERE order_id = $5`,
        [finalMerchantTxnNo, payphiTxnID, paymentMethod, paymentDateTime, order.order_id]
      );
    });

    return { success: false, status: 'FAILED', response: raw };
  }

  // ── PENDING: no DB change, let frontend retry ──
  return { success: false, status: 'PENDING', response: raw };
}

// -------- PhonePe Payment --------

async function initiatePhonePePayment({ bookingId, email, mobile, amount: frontendAmount }) {
  const identifier = bookingId;
  const isNumeric = /^\d+$/.test(String(identifier));

  const orderRes = isNumeric
    ? await pool.query(`SELECT * FROM orders WHERE order_id = $1`, [parseInt(identifier)])
    : await pool.query(`SELECT * FROM orders WHERE order_ref = $1`, [identifier]);

  if (!orderRes.rows.length) { const e = new Error('Order not found'); e.status = 404; throw e; }
  const order = orderRes.rows[0];
  const orderId = order.order_id;

  if (order.payment_status === 'Completed') {
    const e = new Error('Payment already completed'); e.status = 400; throw e;
  }

  const merchantTxnNo = `${order.order_ref}_${Math.floor(Date.now() / 1000)}`;

  // Use the frontend-supplied amount as the authoritative payment amount.
  const amount = Number(frontendAmount);

  // Log for verification / debugging
  const dbTotal = Number(order.total_amount || 0);
  const dbDiscount = Number(order.discount_amount || 0);
  console.log('💰 PhonePe Payment Amount:', {
    frontendAmount: amount,
    dbTotal,
    dbDiscount,
    dbFinalAmount: order.final_amount,
    orderRef: order.order_ref,
    orderId,
  });

  if (!amount || amount <= 0) {
    const e = new Error('Order total must be greater than zero to initiate payment');
    e.status = 400;
    throw e;
  }

  let redirectUrl, merchantTransactionId, raw, result;
  try {
    result = await phonepeService.initiate({
      merchantTxnNo,
      amount,
      customerEmailID: email,
      customerMobileNo: mobile,
      merchantUserId: `USER_${order.user_id || Date.now()}`
    });
    redirectUrl = result.redirectUrl;
    merchantTransactionId = result.merchantTransactionId;
    raw = result.raw;
  } catch (phonepeErr) {
    console.error('[PhonePe] Payment initiation failed:', phonepeErr.message || phonepeErr);
    const e = new Error(`PhonePe payment initiation failed: ${phonepeErr.message || 'Unknown error'} `);
    e.status = phonepeErr.status || 502;
    throw e;
  }

  if (merchantTransactionId) {
    await pool.query(
      `UPDATE orders SET payment_ref = $1, payment_txn_no = NULL, payment_mode = 'PhonePe' WHERE order_id = $2`,
      [merchantTransactionId, orderId]
    );
  }

  return { redirectUrl, merchantTransactionId, success: !!redirectUrl, response: raw };
}

async function checkPhonePeStatus(orderIdOrTxnNo) {
  let order = null;

  // Try by numeric ID if appropriate
  const isNumeric = !isNaN(parseInt(orderIdOrTxnNo)) && !String(orderIdOrTxnNo).startsWith('ORD') && !String(orderIdOrTxnNo).startsWith('OMO');
  if (isNumeric) {
    const orderRes = await pool.query(`SELECT * FROM orders WHERE order_id = $1`, [parseInt(orderIdOrTxnNo)]);
    order = orderRes.rows[0];
  }

  // Fallback: search by references
  if (!order) {
    const orderResByRef = await pool.query(
      `SELECT * FROM orders 
       WHERE payment_txn_no = $1 OR payment_ref = $1 OR order_ref = $1`,
      [orderIdOrTxnNo]
    );
    order = orderResByRef.rows[0];
  }

  if (!order) {
    console.warn('[PhonePe] Status check failed: Order not found', { identifier: orderIdOrTxnNo });
    const e = new Error('Order not found');
    e.status = 404;
    throw e;
  }

  const merchantTxnNo = order.payment_txn_no || order.payment_ref;
  if (!merchantTxnNo) {
    const e = new Error('No PhonePe transaction reference found');
    e.status = 400;
    throw e;
  }

  const { success, raw } = await phonepeService.status({
    merchantTxnNo
  });

  // PhonePe state values: COMPLETED, FAILED, PENDING, CANCELLED
  const rawState = String(raw?.state || '').toUpperCase();
  const isExplicitFail = ['FAILED', 'DECLINED', 'ERROR', 'CANCELLED'].includes(rawState)
    || rawState === 'FAIL';

  // ── SUCCESS: update DB to Completed + CONFIRMED ──
  if (success && order.payment_status !== 'Completed') {
    const phonePeTxnID = raw?.transactionId || 
      raw?.paymentDetails?.[0]?.transactionId || 
      raw?.fullResponse?.paymentDetails?.[0]?.transactionId || 
      merchantTxnNo;
    const finalMerchantTxnNo = raw?.merchantTransactionId || merchantTxnNo;

    await withTransaction(async (client) => {
      // Extract payment method from PhonePe response (e.g. UPI, CARD, NETBANKING)
      const paymentMethod = raw?.paymentInstrument?.type || raw?.paymentDetails?.[0]?.paymentMode || raw?.fullResponse?.paymentDetails?.[0]?.paymentMode || null;
      // PhonePe doesn't have a single "paymentDateTime" string in this format usually, 
      // but we can use the current timestamp in YYYYMMDDHHmmss format if missing or format their timestamp
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const defaultDateTime = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const ts = raw?.paymentDetails?.[0]?.timestamp || raw?.fullResponse?.paymentDetails?.[0]?.timestamp || raw?.completedAt;
      let paymentDateTime = defaultDateTime;
      if (ts) {
        const d = new Date(ts);
        d.setUTCHours(d.getUTCHours() + 5);
        d.setUTCMinutes(d.getUTCMinutes() + 30);
        paymentDateTime = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
      }

      // Update Order
      await client.query(
        `UPDATE orders SET payment_status = 'Completed', payment_ref = $1, payment_txn_no = $2, payment_mode = 'PhonePe', payment_method = $3, payment_datetime = $4, updated_at = NOW() WHERE order_id = $5`,
        [finalMerchantTxnNo, phonePeTxnID, paymentMethod, paymentDateTime, order.order_id]
      );

      // Update Bookings
      await client.query(
        `UPDATE bookings SET payment_status = 'Completed', payment_ref = $1, payment_txn_no = $2, payment_mode = 'PhonePe', payment_method = $3, payment_datetime = $4, booking_status = 'CONFIRMED', updated_at = NOW() WHERE order_id = $5`,
        [finalMerchantTxnNo, phonePeTxnID, paymentMethod, paymentDateTime, order.order_id]
      );
    });

    // Generate and store ticket in S3
    try {
      const bRes = await pool.query('SELECT booking_id FROM bookings WHERE order_id = $1 LIMIT 1', [order.order_id]);
      if (bRes.rows.length > 0) {
        const ticketUrl = await ticketService.generateTicket(bRes.rows[0].booking_id);
        await pool.query('UPDATE bookings SET ticket_pdf = $1 WHERE order_id = $2', [ticketUrl, order.order_id]);
      }
    } catch (err) {
      console.error('Failed to generate/store ticket in S3 after PhonePe payment', err);
    }

    // Send single combined email for the entire order
    try {
      await ticketEmailService.sendOrderEmail(order.order_id);
    } catch (err) {
      console.error('Failed to send order email', err);
    }

    // Send WhatsApp ticket for the entire order
    try {
      await interaktService.sendTicketForOrder(order.order_id, { force: true });
    } catch (err) {
      console.error('Failed to send WhatsApp ticket for order', err);
    }

    return { success: true, status: 'COMPLETED', response: raw };
  }

  // ── Already completed — no-op ──
  if (order.payment_status === 'Completed') {
    return { success: true, status: 'COMPLETED', response: raw };
  }

  // ── EXPLICIT FAILURE: Update DB to Failed & Cancelled ──
  if (isExplicitFail && order.payment_status !== 'Failed') {
    const phonePeTxnID = raw?.transactionId || 
      raw?.paymentDetails?.[0]?.transactionId || 
      raw?.fullResponse?.paymentDetails?.[0]?.transactionId || 
      merchantTxnNo;
    const finalMerchantTxnNo = raw?.merchantTransactionId || merchantTxnNo;

    console.log('🔍 DEBUG PhonePe Payment FAILED:', { orderId: order.order_id, rawState, phonePeTxnID, finalMerchantTxnNo });

    await withTransaction(async (client) => {
      const paymentMethod = raw?.paymentInstrument?.type || raw?.paymentDetails?.[0]?.paymentMode || raw?.fullResponse?.paymentDetails?.[0]?.paymentMode || null;
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const defaultDateTime = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const ts = raw?.paymentDetails?.[0]?.timestamp || raw?.fullResponse?.paymentDetails?.[0]?.timestamp || raw?.completedAt;
      let paymentDateTime = defaultDateTime;
      if (ts) {
        const d = new Date(ts);
        d.setUTCHours(d.getUTCHours() + 5);
        d.setUTCMinutes(d.getUTCMinutes() + 30);
        paymentDateTime = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
      }

      // Update Order
      await client.query(
        `UPDATE orders SET payment_status = 'Failed', payment_ref = $1, payment_txn_no = $2, payment_mode = 'PhonePe', payment_method = $3, payment_datetime = $4, updated_at = NOW() WHERE order_id = $5`,
        [finalMerchantTxnNo, phonePeTxnID, paymentMethod, paymentDateTime, order.order_id]
      );

      // Update Bookings — mark as Cancelled
      await client.query(
        `UPDATE bookings SET payment_status = 'Failed', booking_status = 'Cancelled', payment_ref = $1, payment_txn_no = $2, payment_mode = 'PhonePe', payment_method = $3, payment_datetime = $4, updated_at = NOW() WHERE order_id = $5`,
        [finalMerchantTxnNo, phonePeTxnID, paymentMethod, paymentDateTime, order.order_id]
      );
    });

    return { success: false, status: 'FAILED', response: raw };
  }

  // ── PENDING: no DB change, let frontend retry ──
  return { success: false, status: 'PENDING', response: raw };
}

// -------- Cancellation --------
async function cancelBooking(id) {
  return bookingsModel.cancelOrder(id);
}

module.exports = {
  computeTotals,
  computeTotalsMulti,
  createBooking,
  createBookings,
  cancelBooking,
  initiatePayPhiPayment,
  checkPayPhiStatus,
  initiatePhonePePayment,
  checkPhonePeStatus,
  createRazorpayOrder: async () => { throw new Error('Razorpay not migrated'); },
  verifyRazorpayPayment: async () => { throw new Error('Razorpay not migrated'); },
};