// services/cartService.js
const { withTransaction } = require('../config/db');
const cartModel = require('../models/cart.model');
const attractionsModel = require('../models/attractions.model');
const combosModel = require('../models/combos.model');
const comboSlotsModel = require('../models/comboSlots.model');
const { getSlotById } = require('../models/attractionSlots.model');
const offersModel = require('../models/offers.model');
const bookingsModel = require('../models/bookings.model');
const bookingService = require('./bookingService');
const payphiService = require('./payphiService');
const phonepeService = require('./phonepe.service');
const payphi = require('../config/payphi');

const round2 = (x) => Number((Math.round((Number(x) || 0) * 100) / 100).toFixed(2));

async function applyOfferPricing({
  targetType,
  targetId,
  slotType = null,
  slotId = null,
  baseAmount = 0,
  booking_date = null,
  booking_time = null,
}) {
  const base = round2(baseAmount);
  if (!offersModel?.findApplicableOfferRule || !targetType || !targetId) {
    return { unit: base, discount: 0, offer: null };
  }

  const match = await offersModel.findApplicableOfferRule({
    targetType,
    targetId,
    slotType,
    slotId,
    date: booking_date,
    time: booking_time,
  });
  if (!match) return { unit: base, discount: 0, offer: null };

  const { offer, rule } = match;
  let discountType = rule?.rule_discount_type || offer.discount_type || (offer.discount_percent ? 'percent' : null);
  let discountValue = rule?.rule_discount_value ?? offer.discount_value ?? offer.discount_percent ?? 0;
  if (!discountType || !discountValue) {
    return { unit: base, discount: 0, offer: null };
  }

  discountType = String(discountType).toLowerCase();
  let discount = discountType === 'amount'
    ? Number(discountValue)
    : (Number(discountValue) / 100) * base;

  if (offer.max_discount != null) {
    discount = Math.min(discount, Number(offer.max_discount));
  }
  discount = Math.min(discount, base);

  const finalUnit = round2(base - discount);
  return {
    unit: finalUnit,
    discount: round2(discount),
    offer: {
      offer_id: offer.offer_id,
      rule_id: rule.rule_id,
      title: offer.title,
      discount_type: discountType,
      discount_value: Number(discountValue),
    },
  };
}

async function getOrCreateCart({ user_id = null, session_id = null, payment_mode = 'Online' }) {
  return cartModel.upsertOpenCart({ user_id, session_id, payment_mode });
}

async function getCartWithItems(cart) {
  if (!cart) return { cart: null, items: [] };
  const items = await cartModel.listItems(cart.cart_id);
  return { cart, items };
}

async function resolveAttractionUnitPrice({ attraction_id, slot_id = null, booking_date = null, booking_time = null }) {
  const attraction = await attractionsModel.getAttractionById(attraction_id);
  if (!attraction) {
    const err = new Error('Attraction not found');
    err.status = 404;
    throw err;
  }
  let unit = Number(attraction.base_price || 0);
  if (slot_id) {
    const slot = await getSlotById(slot_id);
    if (!slot) {
      const err = new Error('Slot not found');
      err.status = 404;
      throw err;
    }
    if (slot.attraction_id && Number(slot.attraction_id) !== Number(attraction_id)) {
      const err = new Error('slot_id does not belong to the provided attraction_id');
      err.status = 400;
      throw err;
    }
    if (slot.available === false) {
      const err = new Error('Slot not available');
      err.status = 409;
      throw err;
    }
    if (slot.price != null) unit = Number(slot.price);
  }
  const baseUnit = round2(unit);
  const pricing = await applyOfferPricing({
    targetType: 'attraction',
    targetId: attraction_id,
    slotType: slot_id ? 'attraction' : null,
    slotId: slot_id,
    baseAmount: baseUnit,
    booking_date,
    booking_time,
  });
  return {
    unit: pricing.unit,
    base_unit: baseUnit,
    discount: pricing.discount,
    offer: pricing.offer,
    attraction,
  };
}

async function resolveComboUnitPrice({ combo_id, combo_slot_id = null, booking_date = null, booking_time = null }) {
  const combo = await combosModel.getComboById(combo_id);
  if (!combo) {
    const err = new Error('Combo not found');
    err.status = 404;
    throw err;
  }
  let unit = Number(combo.combo_price || 0);
  if (combo_slot_id) {
    const slot = await comboSlotsModel.getSlotById(combo_slot_id);
    if (!slot) {
      const err = new Error('Combo slot not found');
      err.status = 404;
      throw err;
    }
    if (slot.combo_id && Number(slot.combo_id) !== Number(combo.combo_id)) {
      const err = new Error('combo_slot_id does not belong to the provided combo_id');
      err.status = 400;
      throw err;
    }
    if (slot.available === false) {
      const err = new Error('Combo slot not available');
      err.status = 409;
      throw err;
    }
    if (slot.price != null) unit = Number(slot.price);
  }
  const baseUnit = round2(unit);
  const pricing = await applyOfferPricing({
    targetType: 'combo',
    targetId: combo_id,
    slotType: combo_slot_id ? 'combo' : null,
    slotId: combo_slot_id,
    baseAmount: baseUnit,
    booking_date,
    booking_time,
  });
  return {
    unit: pricing.unit,
    base_unit: baseUnit,
    discount: pricing.discount,
    offer: pricing.offer,
    combo,
  };
}

async function addItem({ user_id = null, session_id = null, item }) {
  const cart = await getOrCreateCart({ user_id, session_id });
  const {
    attraction_id = null,
    combo_id = null,
    slot_id = null,
    combo_slot_id = null,
    booking_date = null,
    booking_time = null,
    quantity = 1,
    item_type = 'attraction',
    meta = {},
  } = item || {};

  const qty = Math.max(1, Number(quantity || 1));

  let unit = 0;
  let pricingMeta = null;
  if (item_type === 'attraction') {
    if (!attraction_id) {
      const err = new Error('attraction_id is required');
      err.status = 400;
      throw err;
    }
    const resolved = await resolveAttractionUnitPrice({ attraction_id, slot_id, booking_date, booking_time });
    unit = resolved.unit;
    pricingMeta = {
      base_unit_price: resolved.base_unit,
      final_unit_price: resolved.unit,
      discount_amount: resolved.discount,
      offer: resolved.offer,
    };
  } else if (item_type === 'combo') {
    if (!combo_id) {
      const err = new Error('combo_id is required');
      err.status = 400;
      throw err;
    }
    const resolved = await resolveComboUnitPrice({ combo_id, combo_slot_id, booking_date, booking_time });
    unit = resolved.unit;
    pricingMeta = {
      base_unit_price: resolved.base_unit,
      final_unit_price: resolved.unit,
      discount_amount: resolved.discount,
      offer: resolved.offer,
    };
  } else {
    const err = new Error('Unsupported item_type');
    err.status = 400;
    throw err;
  }

  const cartItem = await cartModel.addItem(cart.cart_id, {
    item_type,
    attraction_id,
    combo_id,
    slot_id,
    combo_slot_id,
    booking_date,
    booking_time,
    quantity: qty,
    unit_price: unit,
    meta,
  });
  if (pricingMeta) cartItem.pricing = pricingMeta;
  const updatedCart = await cartModel.recomputeTotals(cart.cart_id);
  const items = await cartModel.listItems(cart.cart_id);
  return { cart: updatedCart, items, added: cartItem };
}

async function updateItem({ user_id = null, session_id = null, cart_item_id, fields }) {
  const cart = await cartModel.getOpenCart({ user_id, session_id });
  if (!cart) {
    const err = new Error('Open cart not found');
    err.status = 404;
    throw err;
  }
  const items = await cartModel.listItems(cart.cart_id);
  const current = items.find((it) => Number(it.cart_item_id) === Number(cart_item_id));
  if (!current) {
    const err = new Error('Cart item not found');
    err.status = 404;
    throw err;
  }

  const next = { ...current, ...(fields || {}) };

  // Recompute unit_price if price-affecting fields changed
  const priceAffecting = ['item_type', 'attraction_id', 'slot_id', 'combo_id', 'combo_slot_id'];
  const mustReprice = priceAffecting.some((k) => Object.prototype.hasOwnProperty.call(fields || {}, k));
  let unitUpdate = undefined;

  if (mustReprice) {
    if (next.item_type === 'attraction') {
      if (!next.attraction_id) {
        const err = new Error('attraction_id is required for attraction item');
        err.status = 400;
        throw err;
      }
      const resolved = await resolveAttractionUnitPrice({
        attraction_id: next.attraction_id,
        slot_id: next.slot_id || null,
        booking_date: next.booking_date || null,
        booking_time: next.booking_time || null,
      });
      unitUpdate = resolved.unit;
      next.pricing = {
        base_unit_price: resolved.base_unit,
        final_unit_price: resolved.unit,
        discount_amount: resolved.discount,
        offer: resolved.offer,
      };
    } else if (next.item_type === 'combo') {
      if (!next.combo_id) {
        const err = new Error('combo_id is required for combo item');
        err.status = 400;
        throw err;
      }
      const resolved = await resolveComboUnitPrice({
        combo_id: next.combo_id,
        combo_slot_id: next.combo_slot_id || null,
        booking_date: next.booking_date || null,
        booking_time: next.booking_time || null,
      });
      unitUpdate = resolved.unit;
      next.pricing = {
        base_unit_price: resolved.base_unit,
        final_unit_price: resolved.unit,
        discount_amount: resolved.discount,
        offer: resolved.offer,
      };
    } else {
      const err = new Error('Unsupported item_type');
      err.status = 400;
      throw err;
    }
  }

  const fieldsToUpdate = { ...fields };
  if (unitUpdate !== undefined) fieldsToUpdate.unit_price = unitUpdate;

  const row = await cartModel.updateItem(cart_item_id, fieldsToUpdate);
  const updatedCart = await cartModel.recomputeTotals(cart.cart_id);
  const updatedItems = await cartModel.listItems(cart.cart_id);
  return { cart: updatedCart, items: updatedItems, updated: row };
}

async function removeItem({ user_id = null, session_id = null, cart_item_id }) {
  const cart = await cartModel.getOpenCart({ user_id, session_id });
  if (!cart) {
    const err = new Error('Open cart not found');
    err.status = 404;
    throw err;
  }
  await cartModel.removeItem(cart_item_id);
  const updatedCart = await cartModel.recomputeTotals(cart.cart_id);
  const items = await cartModel.listItems(cart.cart_id);
  return { cart: updatedCart, items };
}

// services/cartService.js (only this function)
async function initiatePayPhi({ user_id = null, session_id = null, email, mobile, name = '' }) {
  const cart = await cartModel.getOpenCart({ user_id, session_id });
  if (!cart) {
    const err = new Error('Open cart not found');
    err.status = 404;
    throw err;
  }
  const items = await cartModel.listItems(cart.cart_id);
  if (!items.length) {
    const err = new Error('Cart is empty');
    err.status = 400;
    throw err;
  }
  const amount = Number(cart.final_amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('Cart total must be greater than zero');
    err.status = 400;
    throw err;
  }
  if (!email || !mobile) {
    const err = new Error('Email and mobile are required');
    err.status = 400;
    throw err;
  }

  // Generate unique merchantTxnNo for each payment attempt to avoid duplicates
  const merchantTxnNo = `ORD${cart.cart_ref}_${Date.now()}`;

  const { redirectUrl, tranCtx, raw } = await payphiService.initiate({
    merchantTxnNo,
    amount,
    customerEmailID: String(email).trim(),
    customerMobileNo: String(mobile).trim(),
    customerName: String(name || '').trim(),
    addlParam1: String(cart.cart_id),
    addlParam2: 'SnowCityCart',
  });

  if (tranCtx) {
    // also persist the reference we used (cart_ref)
    await cartModel.setPayment(cart.cart_id, {
      payment_status: 'Pending',
      payment_ref: tranCtx,
      payment_txn_no: merchantTxnNo, // keep for audit
    });
  }

  return { redirectUrl, tranCtx, response: raw };
}

async function initiatePhonePe({ user_id = null, session_id = null, email, mobile, name = '' }) {
  const cart = await cartModel.getOpenCart({ user_id, session_id });
  if (!cart) {
    const err = new Error('Open cart not found');
    err.status = 404;
    throw err;
  }
  const items = await cartModel.listItems(cart.cart_id);
  if (!items.length) {
    const err = new Error('Cart is empty');
    err.status = 400;
    throw err;
  }
  const amount = Number(cart.final_amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('Cart total must be greater than zero');
    err.status = 400;
    throw err;
  }
  if (!email || !mobile) {
    const err = new Error('Email and mobile are required');
    err.status = 400;
    throw err;
  }

  // Build unique merchantTxnNo for PhonePe
  const merchantTxnNo = `PP_${cart.cart_ref}_${Date.now()}`;

  const { redirectUrl, merchantTransactionId, raw } = await phonepeService.initiate({
    merchantTxnNo,
    amount,
    customerEmailID: String(email).trim(),
    customerMobileNo: String(mobile).trim(),
    customerName: String(name || '').trim(),
    merchantUserId: `USER_${user_id || Date.now()}`
  });

  if (merchantTransactionId) {
    await cartModel.setPayment(cart.cart_id, {
      payment_status: 'Pending',
      payment_ref: merchantTransactionId,
      payment_txn_no: merchantTxnNo,
      payment_mode: 'PhonePe'
    });
  }

  return { redirectUrl, merchantTransactionId, response: raw };
}

// Helper to load existing bookings created from a cart (idempotency)
async function getBookingsForCart(cart_id) {
  return withTransaction(async (client) => {
    const res = await client.query(
      `
      SELECT b.*
      FROM cart_bookings cb
      JOIN bookings b ON b.booking_id = cb.booking_id
      WHERE cb.cart_id = $1
      ORDER BY b.created_at ASC
      `,
      [cart_id]
    );
    return res.rows || [];
  });
}

// Helper to persist cart->booking mappings in one shot
async function linkCartBookings(cart_id, bookingIds = []) {
  if (!bookingIds.length) return;
  await withTransaction(async (client) => {
    const values = bookingIds.map((_, idx) => `($1, $${idx + 2})`).join(', ');
    await client.query(
      `INSERT INTO cart_bookings (cart_id, booking_id) VALUES ${values}
       ON CONFLICT ON CONSTRAINT uq_cart_booking DO NOTHING`,
      [cart_id, ...bookingIds]
    );
  });
}

async function createBookingsFromCart(cart_id, user_id) {
  const cart = await cartModel.getCartById(cart_id);
  if (!cart) {
    const err = new Error('Cart not found');
    err.status = 404;
    throw err;
  }

  // Idempotency: if already converted, return existing bookings
  const existing = await getBookingsForCart(cart_id);
  if (existing.length > 0 || cart.status === 'Paid') {
    // normalize via model before returning
    const mapped = await Promise.all(existing.map((r) => bookingsModel.getBookingById(r.booking_id)));
    return mapped.filter(Boolean);
  }

  if (cart.payment_status !== 'Completed') {
    const err = new Error('Cart payment not completed');
    err.status = 400;
    throw err;
  }

  const items = await cartModel.listItems(cart_id);
  if (!items.length) {
    const err = new Error('Cart is empty');
    err.status = 400;
    throw err;
  }

  // Create bookings per item (each function handles its own transaction + capacity locks)
  const created = [];
  for (const it of items) {
    if (it.item_type === 'combo') {
      const b = await bookingService.createComboBooking({
        user_id,
        combo_id: it.combo_id,
        combo_slot_id: it.combo_slot_id,
        quantity: it.quantity,
        booking_date: it.booking_date,
        booking_time: it.booking_time,
        payment_mode: cart.payment_mode,
      });
      await bookingsModel.setPayment(b.booking_id, {
        payment_status: 'Completed',
        payment_ref: cart.payment_ref,
      });
      created.push(b);
    } else if (it.item_type === 'attraction') {
      const b = await bookingService.createBooking({
        user_id,
        attraction_id: it.attraction_id,
        slot_id: it.slot_id,
        quantity: it.quantity,
        booking_date: it.booking_date,
        booking_time: it.booking_time,
        payment_mode: cart.payment_mode,
      });
      await bookingsModel.setPayment(b.booking_id, {
        payment_status: 'Completed',
        payment_ref: cart.payment_ref,
      });
      created.push(b);
    } else {
      // unsupported types are skipped for now
    }
  }

  // Link cart -> bookings and finalize cart status
  await linkCartBookings(cart_id, created.map((b) => b.booking_id));

  // Mark cart as Paid (status) and ensure payment_status is Completed
  await cartModel.setStatus(cart_id, 'Paid');
  await cartModel.setPayment(cart_id, { payment_status: 'Completed', payment_ref: cart.payment_ref });

  return created;
}

module.exports = {
  getOrCreateCart,
  getCartWithItems,
  addItem,
  updateItem,
  removeItem,
  initiatePayPhi,
  initiatePhonePe,
  createBookingsFromCart,
};