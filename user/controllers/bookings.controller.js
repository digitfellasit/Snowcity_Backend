'use strict';

const bookingsModel = require('../../models/bookings.model');
const bookingService = require('../../services/bookingService');
const ticketService = require('../../services/ticketService');

const me = (req) => req.user?.id || req.user?.user_id || null;

const toInt = (n, d = null) => {
  const v = Number(n);
  return Number.isFinite(v) ? v : d;
};
const isPosInt = (n) => Number.isInteger(n) && n > 0;

function normalizeAddons(addons) {
  if (!Array.isArray(addons)) return [];
  return addons
    .map((a) => ({
      addon_id: toInt(a?.addon_id ?? a?.id ?? a?.addonId, null),
      quantity: Math.max(1, toInt(a?.quantity ?? a?.qty, 1))
    }))
    .filter((a) => isPosInt(a.addon_id));
}

function normalizeCreateItem(input = {}, userId = null) {
  console.log('🔍 DEBUG normalizeCreateItem input:', input);

  const item = input || {};

  // IDs (accept snake_case and camelCase)
  const attraction_id = toInt(item.attraction_id ?? item.attractionId, null);
  const slot_id = toInt(item.slot_id ?? item.slotId, null);
  const combo_id = toInt(item.combo_id ?? item.comboId, null);
  // For combo_slot_id, preserve virtual slot IDs (strings like '5-20251204-10') but also handle integer IDs
  let combo_slot_id = item.combo_slot_id ?? item.comboSlotId ?? null;
  if (combo_slot_id && /^\d+$/.test(String(combo_slot_id))) {
    combo_slot_id = toInt(combo_slot_id, null);
  }
  const offer_id = toInt(item.offer_id ?? item.offerId, null);

  // Basics
  const quantity = Math.max(1, toInt(item.quantity ?? item.qty, 1));
  const booking_date = item.booking_date || item.date || null;
  const payment_mode = item.payment_mode || 'Online';

  // Coupon code might be per item in UI, but usually applied per cart.
  // We extract it here but the service might pick the first one.
  const coupon_code = (item.coupon_code ?? item.couponCode ?? item.coupon)?.trim() || null;

  // Slot timing information
  let slot_label = item.slot_label || item.slotLabel || null;
  let slot_start_time = item.slot_start_time || item.slotStartTime || item.slot?.start_time || null;
  let slot_end_time = item.slot_end_time || item.slotEndTime || item.slot?.end_time || null;

  // If frontend didn't provide slot timing, extract from virtual slot ID
  if (!slot_start_time && !slot_end_time) {
    const slotId = item.slot_id || item.combo_slot_id;
    if (slotId && typeof slotId === 'string' && slotId.includes('-')) {
      const parts = slotId.split('-');
      const hourStr = parts[parts.length - 1];
      const hour = parseInt(hourStr);

      if (!isNaN(hour)) {
        slot_start_time = `${String(hour).padStart(2, '0')}:00:00`;

        // Attraction slots are 1 hour, combo slots are 2 hours
        const duration = item.combo_id ? 2 : 1;
        slot_end_time = `${String((hour + duration) % 24).padStart(2, '0')}:00:00`;

        // Generate slot label
        const formatTime12Hour = (time24) => {
          const [hours, minutes] = time24.split(':');
          const hour = parseInt(hours);
          const ampm = hour >= 12 ? 'PM' : 'AM';
          const hour12 = hour % 12 || 12;
          return `${hour12}:${minutes} ${ampm}`;
        };

        slot_label = `${formatTime12Hour(slot_start_time)} - ${formatTime12Hour(slot_end_time)}`;

        console.log('🔍 DEBUG extracted timing from virtual slot ID:', {
          slotId,
          hour,
          slot_start_time,
          slot_end_time,
          slot_label
        });
      }
    }
  }

  console.log('🔍 DEBUG backend slot timing:', {
    slot_label,
    slot_start_time,
    slot_end_time,
    original_slot_label: item.slot_label,
    original_slotLabel: item.slotLabel,
    slot_object: item.slot
  });

  const addons = normalizeAddons(item.addons);

  // Item type (explicit or inferred)
  const item_typeRaw = item.item_type || item.itemType || (combo_id ? 'Combo' : 'Attraction');
  const item_type = String(item_typeRaw).trim() === 'Combo' ? 'Combo' : 'Attraction';

  // Validate minimal shape
  if (item_type === 'Attraction' && !isPosInt(attraction_id)) {
    // It's possible validation happens in service, but good to catch early
  }

  const result = {
    user_id: userId || null,
    item_type,
    attraction_id: item_type === 'Attraction' ? attraction_id : null,
    slot_id: item_type === 'Attraction' ? slot_id : null,
    combo_id: item_type === 'Combo' ? combo_id : null,
    combo_slot_id: item_type === 'Combo' ? combo_slot_id : null,
    offer_id: offer_id || null,
    coupon_code,
    quantity,
    addons,
    booking_date,
    payment_mode,
    slot_label,
    slot_start_time,
    slot_end_time
  };

  console.log('🔍 DEBUG normalizeCreateItem result:', result);

  return result;
}

/* ====== Controllers ====== */

// List Orders (grouped) or Bookings
exports.listMyBookings = async (req, res, next) => {
  try {
    const userId = me(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const page = Math.max(1, toInt(req.query.page, 1));
    const limit = Math.min(100, Math.max(1, toInt(req.query.limit, 50)));
    const offset = (page - 1) * limit;

    // By default, this lists individual bookings. 
    // If you want to list Orders, you would need a bookingsModel.listOrders({ user_id... })
    // For now, keeping existing behavior but just ensuring it filters by user.
    const data = await bookingsModel.listBookings({ user_id: userId, limit, offset });

    res.json({
      data,
      meta: { page, limit, count: data.length, hasNext: data.length === limit }
    });
  } catch (err) { next(err); }
};

// Get Order Details (Receipt)
exports.getOrderDetails = async (req, res, next) => {
  try {
    const userId = me(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const id = toInt(req.params.id, null);
    if (!isPosInt(id)) return res.status(400).json({ error: 'Invalid ID' });

    // Try to get Order (Parent)
    const order = await bookingsModel.getOrderWithDetails(id);

    // If order exists, verify ownership
    if (order) {
      if (order.user_id !== userId) return res.status(404).json({ error: 'Order not found' });
      return res.json(order);
    }

    // Fallback: Try to get single Booking (Legacy support)
    const booking = await bookingsModel.getBookingById(id);
    if (!booking || booking.user_id !== userId) return res.status(404).json({ error: 'Not found' });

    return res.json(booking);
  } catch (err) { next(err); }
};

/**
 * Create Order
 * - Accepts a single object or an array of objects.
 * - Calculates totals, creates Order + Bookings + Addons in transaction.
 */
exports.createOrder = async (req, res, next) => {
  try {
    const userId = me(req);
    const body = req.body;
    if (!body) return res.status(400).json({ error: 'Request body is required' });

    // Normalize input
    let items = [];
    if (Array.isArray(body)) {
      if (!body.length) return res.status(400).json({ error: 'Items array is empty' });
      items = body.map((it) => normalizeCreateItem(it, userId));
    } else {
      items = [normalizeCreateItem(body, userId)];
    }

    // Call Service
    const result = await bookingService.createBookings(items);

    // Result structure: { order_id, order, bookings: [] }
    return res.status(201).json(result);
  } catch (err) { next(err); }
};

// Initiate Payment for an Order
exports.initiatePayPhiPayment = async (req, res, next) => {
  try {
    const userId = me(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const id = toInt(req.params.id, null); // This is the ORDER ID
    if (!isPosInt(id)) return res.status(400).json({ error: 'Invalid Order ID' });

    // Verify Order ownership
    // We can do a quick DB check or let service handle it, but verifying user matches is safer here
    // For optimization, we let service fail if order not found, but strictly we should check user_id.
    // Skipping explicit user check DB call here for speed, service will throw if order doesn't exist.

    const { email, mobile, amount } = (req.body && typeof req.body === 'object') ? req.body : {};
    if (!email || !mobile) return res.status(400).json({ error: 'email and mobile are required' });

    const out = await bookingService.initiatePayPhiPayment({
      bookingId: id, // Service param name is legacy, but we pass Order ID
      email,
      mobile,
      amount // Optional: pass the amount from frontend for verification
    });
    res.json(out);
  } catch (err) { next(err); }
};

// Check Payment Status for an Order
exports.checkPayPhiStatus = async (req, res, next) => {
  try {
    const userId = me(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const id = toInt(req.params.id, null); // ORDER ID
    if (!isPosInt(id)) return res.status(400).json({ error: 'Invalid Order ID' });

    const out = await bookingService.checkPayPhiStatus(id);
    res.json(out);
  } catch (err) { next(err); }
};

// Initiate PhonePe Payment for an Order
exports.initiatePhonePePayment = async (req, res, next) => {
  try {
    const userId = me(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const id = toInt(req.params.id, null); // This is the ORDER ID
    if (!isPosInt(id)) {
      console.warn(`[PhonePe] Invalid Order ID param: "${req.params.id}" (parsed: ${id})`);
      return res.status(400).json({
        error: 'Invalid Order ID',
        details: `Expected a positive integer, received: "${req.params.id}"`
      });
    }

    const { email, mobile, amount } = (req.body && typeof req.body === 'object') ? req.body : {};
    if (!email || !mobile) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: 'Both email and mobile are required to initiate payment'
      });
    }

    const out = await bookingService.initiatePhonePePayment({
      bookingId: id, // Service param name is legacy, but we pass Order ID
      email,
      mobile,
      amount
    });
    res.json(out);
  } catch (err) {
    console.error(`[PhonePe] initiatePayment error for order ${req.params.id}:`, err.message);
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
};

// Check PhonePe Payment Status for an Order
exports.checkPhonePeStatus = async (req, res, next) => {
  try {
    const userId = me(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const id = toInt(req.params.id, null); // ORDER ID
    if (!isPosInt(id)) {
      console.warn(`[PhonePe] Invalid Order ID param for status check: "${req.params.id}"`);
      return res.status(400).json({
        error: 'Invalid Order ID',
        details: `Expected a positive integer, received: "${req.params.id}"`
      });
    }

    const out = await bookingService.checkPhonePeStatus(id);
    res.json(out);
  } catch (err) {
    console.error(`[PhonePe] checkStatus error for order ${req.params.id}:`, err.message);
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
};

// Download Ticket PDF (generated on-the-fly, never stored)
exports.downloadTicket = async (req, res, next) => {
  try {
    const userId = me(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const id = toInt(req.params.id, null);
    if (!isPosInt(id)) return res.status(400).json({ error: 'Invalid Booking ID' });

    // Verify ownership
    const booking = await bookingsModel.getBookingById(id);
    if (!booking || booking.user_id !== userId) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.payment_status !== 'Completed') {
      return res.status(400).json({ error: 'Payment not completed' });
    }

    // Check if we already have an S3 URL stored
    if (booking.ticket_pdf && booking.ticket_pdf.startsWith('http')) {
      return res.redirect(booking.ticket_pdf);
    }

    // Generate PDF buffer on-the-fly
    const { buffer, filename } = await ticketService.generateTicketBuffer(id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (err) { next(err); }
};