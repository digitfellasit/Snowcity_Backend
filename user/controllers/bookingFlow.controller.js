// bookingFlow.controller.js
// New endpoints for a step-by-step booking flow:
// - POST /user/booking-flow/preview        -> step 1 / 2 (select attraction/combo, slot, qty, addons) - returns totals
// - POST /user/booking-flow/otp/send      -> step 3 (send OTP for guest / logged-out users)
// - POST /user/booking-flow/otp/verify    -> step 3 (verify OTP, returns token & optionally prepares cart/payment if draft provided)
// - POST /user/booking-flow/initiate      -> step 4 (requires auth) - save to cart + initiate payment

const bookingService = require('../../services/bookingService');
const cartService = require('../../services/cartService');
const attractionsModel = require('../../models/attractions.model');
const combosModel = require('../../models/combos.model');
const comboSlotsModel = require('../../models/comboSlots.model');
const { getSlotById } = require('../../models/attractionSlots.model');
const authService = require('../../services/authService');
const usersModel = require('../../models/users.model');
const bookingsModel = require('../../models/bookings.model');
const cartModel = require('../../models/cart.model');
const payphiService = require('../../services/payphiService');

function me(req) {
  return req.user?.id || null;
}

/**
 * Step 1 / 2: Preview selection & compute totals.
 * Accepts either attraction_id or combo_id, optional slot/combo_slot, quantity, addons, coupon_code, booking_date.
 */
exports.preview = async (req, res, next) => {
  try {
    const {
      attraction_id = null,
      combo_id = null,
      slot_id = null,
      combo_slot_id = null,
      quantity = 1,
      addons = [],
      coupon_code = null,
      booking_date = null,
      booking_time = null,
    } = req.body || {};

    if (!attraction_id && !combo_id) {
      return res.status(400).json({ error: 'attraction_id or combo_id is required' });
    }

    let totals;
    if (combo_id) {
      totals = await bookingService.computeComboTotals({
        combo_id,
        combo_slot_id,
        quantity,
        addons,
        coupon_code,
        onDate: booking_date,
      });
      // Add friendly product name
      totals.product_name = (totals.combo && totals.combo.combo_id) ? totals.combo.combo_price ? `Combo #${totals.combo.combo_id}` : `Combo` : 'Combo';
    } else {
      totals = await bookingService.computeTotals({
        attraction_id,
        slot_id,
        quantity,
        addons,
        coupon_code,
        onDate: booking_date,
      });
      totals.product_name = totals.attraction ? totals.attraction.title : 'Attraction';
    }

    // If slot info available, include label
    if (slot_id) {
      const slot = await getSlotById(slot_id);
      if (slot) {
        totals.slot = { start_time: slot.start_time, end_time: slot.end_time, label: `${slot.start_time} - ${slot.end_time}` };
      }
    } else if (combo_slot_id) {
      const cslot = await comboSlotsModel.getSlotById(combo_slot_id);
      if (cslot) totals.combo_slot = cslot;
    }

    return res.json({ ok: true, preview: totals });
  } catch (err) {
    next(err);
  }
};

exports.confirm = async (req, res, next) => {
  try {
    const userId = me(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized. Please login/verify OTP.' });
    const payment_ref = req.body?.payment_ref || req.query?.payment_ref;
    if (!payment_ref) return res.status(400).json({ error: 'payment_ref is required' });

    const bookings = await bookingsModel.getBookingsByPaymentRef(payment_ref);
    if (!bookings.length) return res.status(404).json({ error: 'No bookings found for reference' });
    if (bookings.some((b) => b.user_id !== userId)) {
      return res.status(403).json({ error: 'Forbidden: bookings do not belong to user' });
    }

    const cart = await cartModel.getCartByPaymentRef(payment_ref);
    const amount = cart?.final_amount || bookings.reduce((sum, b) => sum + Number(b.final_amount || 0), 0);
    const merchantTxnNo = cart?.payment_txn_no || `${bookings[0].booking_ref}`;

    const { success, raw } = await payphiService.status({
      merchantTxnNo,
      originalTxnNo: merchantTxnNo,
      amount,
    });

    let updated = bookings;
    if (success) {
      updated = await bookingService.markBookingsPaidByRef(payment_ref);
      if (cart?.cart_id) {
        await cartModel.setPayment(cart.cart_id, { payment_status: 'Completed', payment_ref });
      }
    }

    res.json({ success, bookings: updated, response: raw });
  } catch (err) {
    next(err);
  }
};

/**
 * Step 3A: Send OTP for guest / logged-out user.
 * Body: { name, email, phone, channel = 'sms' }
 * Re-uses authService.sendOtp({ email, phone, name, channel, createIfNotExists: true })
 */
exports.sendOtp = async (req, res, next) => {
  try {
    const { name, email, phone, channel = 'sms' } = req.body || {};
    if (!email && !phone) return res.status(400).json({ error: 'email or phone is required' });
    // create user if not exists and send OTP
    const out = await authService.sendOtp({
      name,
      email,
      phone,
      channel,
      createIfNotExists: true,
    });
    // authService.sendOtp should return info about delivery; echo it
    res.json({ ok: true, result: out });
  } catch (err) {
    next(err);
  }
};

/**
 * Step 3B: Verify OTP and return token + user.
 * Body: { otp, email, phone, draft } where draft is optional selection object
 *
 * If draft is present, we *optionally* create a cart item for the just-verified user and return info required to initiate payment.
 * NOTE: We do NOT initiate payment here automatically (client will call /initiate to begin payment).
 */
exports.verifyOtp = async (req, res, next) => {
  try {
    const { otp, email, phone, draft } = req.body || {};
    if (!otp) return res.status(400).json({ error: 'otp is required' });
    if (!email && !phone) return res.status(400).json({ error: 'email or phone is required' });

    const verifyResult = await authService.verifyOtp({ otp, email, phone });
    // verifyResult expected to include { user, token, expires_at } as in your other controller usage
    if (!verifyResult || !verifyResult.user) {
      return res.status(400).json({ error: 'OTP verification failed' });
    }

    // If draft provided, create cart and add item(s) so frontend can immediately go to payment
    let cartInfo = null;
    if (draft && typeof draft === 'object') {
      // draft should include the same selection fields used in preview:
      const {
        attraction_id = null,
        combo_id = null,
        slot_id = null,
        combo_slot_id = null,
        booking_date = null,
        booking_time = null,
        quantity = 1,
        addons = [],
        meta = {},
      } = draft;

      // Create/get open cart for user
      const cart = await cartService.getOrCreateCart({ user_id: verifyResult.user.user_id, session_id: null, payment_mode: 'Online' });

      // Build product_name and purchased_at for meta
      let product_name = 'Product';
      if (combo_id) {
        const combo = await combosModel.getComboById(combo_id);
        product_name = combo ? (combo.title || `Combo ${combo.combo_id}`) : `Combo`;
      } else if (attraction_id) {
        const att = await attractionsModel.getAttractionById(attraction_id);
        product_name = att ? att.title : 'Attraction';
      }

      const itemMeta = Object.assign({}, meta, {
        product_name,
        purchased_at: new Date().toISOString(),
        draft_saved: true,
      });

      // Add item to cart
      const cartItem = await cartService.addItem({
        user_id: verifyResult.user.user_id,
        session_id: null,
        item: {
          item_type: combo_id ? 'combo' : 'attraction',
          attraction_id,
          combo_id,
          slot_id,
          combo_slot_id,
          booking_date,
          booking_time,
          quantity,
          meta: itemMeta,
        },
      });

      const updatedCart = await cartService.getOrCreateCart({ user_id: verifyResult.user.user_id, session_id: null });
      const cartWithItems = await cartService.getCartWithItems(updatedCart);
      cartInfo = cartWithItems;
    }

    res.json({
      ok: true,
      verified: true,
      user: verifyResult.user,
      token: verifyResult.token,
      expires_at: verifyResult.expires_at,
      cart: cartInfo,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Step 4: Initiate Payment.
 * Requires auth (logged in). The user may have been just verified (client should attach token).
 * Body: { attraction_id, combo_id, slot_id, combo_slot_id, booking_date, booking_time, quantity, addons, meta, email, mobile }
 *
 * This saves the product in the cart and calls cartService.initiatePayPhi (existing payment logic).
 */
exports.initiate = async (req, res, next) => {
  try {
    const userId = me(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized. Please login/verify OTP.' });

    const {
      attraction_id = null,
      combo_id = null,
      slot_id = null,
      combo_slot_id = null,
      booking_date = null,
      booking_time = null,
      quantity = 1,
      addons = [],
      meta = {},
      email = null,
      mobile = null,
    } = req.body || {};

    if (!attraction_id && !combo_id) {
      return res.status(400).json({ error: 'attraction_id or combo_id is required' });
    }

    // Resolve product name for metadata
    let product_name = 'Product';
    if (combo_id) {
      const combo = await combosModel.getComboById(combo_id);
      product_name = combo ? (combo.title || `Combo ${combo.combo_id}`) : `Combo`;
    } else {
      const att = await attractionsModel.getAttractionById(attraction_id);
      product_name = att ? att.title : 'Attraction';
    }

    const itemMeta = Object.assign({}, meta, {
      product_name,
      purchased_at: new Date().toISOString(),
    });

    // Create/get cart and add item
    const cart = await cartService.getOrCreateCart({ user_id: userId, session_id: null, payment_mode: 'Online' });

    const cartItem = await cartService.addItem(cart.cart_id, {
      item_type: combo_id ? 'combo' : 'attraction',
      attraction_id,
      combo_id,
      slot_id,
      combo_slot_id,
      booking_date,
      booking_time,
      quantity,
      unit_price: undefined, // cartService.addItem expects unit_price. We'll resolve by re-using existing resolution code:
      meta: itemMeta,
    }).catch(async (e) => {
      // fallback: call cartService.addItem using resolved unit price
      let unit = 0;
      if (combo_id) {
        const resolved = await cartService.resolveComboUnitPrice?.({ combo_id, combo_slot_id }).catch(() => null);
        unit = resolved ? resolved.unit : 0;
      } else {
        const resolved = await cartService.resolveAttractionUnitPrice?.({ attraction_id, slot_id }).catch(() => null);
        unit = resolved ? resolved.unit : 0;
      }
      // Try again with unit
      return cartService.addItem(cart.cart_id, {
        item_type: combo_id ? 'combo' : 'attraction',
        attraction_id,
        combo_id,
        slot_id,
        combo_slot_id,
        booking_date,
        booking_time,
        quantity,
        unit_price: unit,
        meta: itemMeta,
      });
    });

    // Recompute totals (cartService.addItem already recomputes internally in existing code path)
    const updatedCart = await cartService.recomputeTotals(cart.cart_id).catch(() => cart);

    // Determine email & mobile to use for payment
    let paymentEmail = email;
    let paymentMobile = mobile;
    let paymentName = '';
    const u = await usersModel.getUserById(userId);
    if (u) {
      if (!paymentEmail) paymentEmail = u.email;
      if (!paymentMobile) paymentMobile = u.phone;
      paymentName = u.name;
    }

    if (!paymentEmail || !paymentMobile) {
      return res.status(400).json({
        error: 'email and mobile are required for payment',
        hint: 'Please provide email and phone, or ensure your account has them set',
      });
    }

    // Initiate payment using existing cartService.initiatePayPhi (doesn't change your payment logic)
    const out = await cartService.initiatePayPhi({ user_id: userId, session_id: null, email: paymentEmail, mobile: paymentMobile, name: paymentName });

    res.json({
      ok: true,
      cart: updatedCart,
      added: cartItem,
      payment: out,
    });
  } catch (err) {
    next(err);
  }
};
