const cartService = require('../../services/cartService');
const usersModel = require('../../models/users.model');

function me(req) {
  return req.user?.id || null;
}

function getSessionId(req) {
  return (req.headers['x-session-id'] || req.headers['x-sessionid'] || '').toString().trim() || null;
}

exports.listCart = async (req, res, next) => {
  try {
    const userId = me(req);
    const sessionId = userId ? null : getSessionId(req);
    if (!userId && !sessionId) return res.status(400).json({ error: 'x-session-id header required for guest carts' });

    const cart = await cartService.getOrCreateCart({ user_id: userId, session_id: sessionId });
    const out = await cartService.getCartWithItems(cart);
    res.json(out);
  } catch (err) { next(err); }
};

exports.addItem = async (req, res, next) => {
  try {
    const userId = me(req);
    const sessionId = userId ? null : getSessionId(req);
    if (!userId && !sessionId) return res.status(400).json({ error: 'x-session-id header required for guest carts' });

    const {
      item_type = 'attraction',
      attraction_id,
      combo_id,
      slot_id = null,
      combo_slot_id = null,
      booking_date = null,
      booking_time = null,
      quantity = 1,
      meta = {},
    } = req.body || {};

    const out = await cartService.addItem({
      user_id: userId,
      session_id: sessionId,
      item: { item_type, attraction_id, combo_id, slot_id, combo_slot_id, booking_date, booking_time, quantity, meta },
    });
    res.status(201).json(out);
  } catch (err) { next(err); }
};

exports.updateItem = async (req, res, next) => {
  try {
    const userId = me(req);
    const sessionId = userId ? null : getSessionId(req);
    if (!userId && !sessionId) return res.status(400).json({ error: 'x-session-id header required for guest carts' });

    const cart_item_id = Number(req.params.id);
    const fields = req.body || {};
    const out = await cartService.updateItem({ user_id: userId, session_id: sessionId, cart_item_id, fields });
    res.json(out);
  } catch (err) { next(err); }
};

exports.removeItem = async (req, res, next) => {
  try {
    const userId = me(req);
    const sessionId = userId ? null : getSessionId(req);
    if (!userId && !sessionId) return res.status(400).json({ error: 'x-session-id header required for guest carts' });

    const cart_item_id = Number(req.params.id);
    const out = await cartService.removeItem({ user_id: userId, session_id: sessionId, cart_item_id });
    res.json(out);
  } catch (err) { next(err); }
};

exports.initiatePayPhi = async (req, res, next) => {
  try {
    const userId = me(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized. Please login/verify OTP.' });

    const user = await usersModel.getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { email, mobile } = (req.body && typeof req.body === 'object') ? req.body : {};
    const paymentEmail = email || user.email;
    const paymentMobile = mobile || user.phone;
    if (!paymentEmail || !paymentMobile) {
      return res.status(400).json({ error: 'email and mobile are required for payment' });
    }

    const out = await cartService.initiatePayPhi({ user_id: userId, session_id: null, email: paymentEmail, mobile: paymentMobile });
    res.json(out);
  } catch (err) { next(err); }
};

exports.checkPayPhiStatus = async (req, res, next) => {
  try {
    const userId = me(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // We simply re-check via return handler; status polling can be added later
    res.json({ note: 'Use /api/webhooks/payphi/return?tranCtx=...' });
  } catch (err) { next(err); }
};

exports.initiatePhonePe = async (req, res, next) => {
  try {
    const userId = me(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized. Please login/verify OTP.' });

    const user = await usersModel.getUserById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { email, mobile } = (req.body && typeof req.body === 'object') ? req.body : {};
    const paymentEmail = email || user.email;
    const paymentMobile = mobile || user.phone;
    if (!paymentEmail || !paymentMobile) {
      return res.status(400).json({ error: 'email and mobile are required for payment' });
    }

    const out = await cartService.initiatePhonePe({ user_id: userId, session_id: null, email: paymentEmail, mobile: paymentMobile });
    res.json(out);
  } catch (err) { next(err); }
};

exports.checkPhonePeStatus = async (req, res, next) => {
  try {
    const userId = me(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // We simply re-check via return handler; status polling can be added later
    res.json({ note: 'Use /api/webhooks/phonepe/return?merchantTransactionId=...' });
  } catch (err) { next(err); }
};

exports.finalizeCheckout = async (req, res, next) => {
  try {
    const id = req.user?.id ?? req.user?.user_id;
    const userId = Number(id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { cart_id = null, cart_ref = null } = req.body || {};

    // Load cart by id/ref or latest completed for this user
    const { pool } = require('../../config/db');
    let cartRow = null;

    if (cart_id) {
      const r = await pool.query(`SELECT * FROM carts WHERE cart_id = $1`, [cart_id]);
      cartRow = r.rows[0] || null;
    } else if (cart_ref) {
      const r = await pool.query(`SELECT * FROM carts WHERE cart_ref = $1`, [cart_ref]);
      cartRow = r.rows[0] || null;
    } else {
      const r = await pool.query(
        `SELECT * FROM carts
         WHERE user_id = $1 AND payment_status = 'Completed'
         ORDER BY updated_at DESC
         LIMIT 1`,
        [userId]
      );
      cartRow = r.rows[0] || null;
    }

    if (!cartRow) return res.status(404).json({ error: 'Cart not found' });
    if (Number(cartRow.user_id) !== Number(userId)) {
      return res.status(403).json({ error: 'Forbidden: Cart does not belong to you' });
    }
    if (cartRow.payment_status !== 'Completed') {
      return res.status(400).json({ error: 'Cart payment not completed yet' });
    }

    // Idempotent conversion to bookings
    const bookings = await require('../../services/cartService').createBookingsFromCart(
      cartRow.cart_id,
      userId
    );

    res.json({ cart_id: cartRow.cart_id, bookings });
  } catch (err) {
    next(err);
  }
};
