// admin/controllers/bookings.controller.js
const { pool, withTransaction } = require('../../config/db');
const bookingsModel = require('../../models/bookings.model');
const bookingService = require('../../services/bookingService');
const payphiService = require('../../services/payphiService');
const { createApiLog } = require('../../models/apiLogs.model');
const ticketService = require('../../services/ticketService');
const ticketEmailService = require('../../services/ticketEmailService');
const interaktService = require('../../services/interaktService');
const { buildScopeFilter } = require('../middleware/scopedAccess');

// Helpers
const toNumber = (val) => {
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
};
const sanitizeDate = (val) => (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val) ? val : null);
const logAdminActivity = async (orderId, bookingId, eventType, eventDetail, oldValue, newValue, performedBy) => {
  try {
    await pool.query(
      `INSERT INTO booking_activity_log (order_id, booking_id, event_type, event_detail, old_value, new_value, performed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [orderId || null, bookingId || null, eventType, eventDetail, oldValue || null, newValue || null, performedBy || null]
    );
  } catch (err) {
    console.error('Failed to log admin activity:', err);
  }
};

exports.listBookings = async function listBookings(req, res, next) {
  try {
    const {
      search = '',
      payment_status,
      booking_status,
      user_email,
      user_phone,
      attraction_id,
      combo_id,
      offer_id,
      item_type,
      date_from,
      date_to,
      start_date,
      end_date,
      slot_id,
      slot_start_time,
      slot_end_time,
      page = '1',
      limit = '20',
    } = req.query;

    const attractionId = toNumber(attraction_id);
    const comboId = toNumber(combo_id);
    const offerId = toNumber(offer_id);
    const slotId = toNumber(slot_id);
    const slotStartTimeFilter = typeof slot_start_time === 'string' && slot_start_time.trim() ? slot_start_time.trim() : null;
    const slotEndTimeFilter = typeof slot_end_time === 'string' && slot_end_time.trim() ? slot_end_time.trim() : null;
    const normalizedItemType = ['Combo', 'Attraction'].includes(item_type) ? item_type : null;
    const dateFrom = sanitizeDate(date_from || start_date);
    const dateTo = sanitizeDate(date_to || end_date);

    // Scoping using admin_access
    const scopes = req.user.scopes || {};
    const attractionScope = scopes.attraction || [];
    const comboScope = scopes.combo || [];

    // If specific attraction filter requested, enforce scope
    if (attractionId && attractionScope.length && !attractionScope.includes('*') && !attractionScope.includes(attractionId)) {
      return res.status(403).json({ error: 'Forbidden: attraction not in scope' });
    }
    // If specific combo filter requested, enforce scope
    if (comboId && comboScope.length && !comboScope.includes('*') && !comboScope.includes(comboId)) {
      return res.status(403).json({ error: 'Forbidden: combo not in scope' });
    }

    const p = Math.max(parseInt(page, 10) || 1, 1);
    const l = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const off = (p - 1) * l;

    const where = [];
    const params = [];
    let i = 1;

    console.time('BookingsList Query Build');

    const comboTitleExpr = `COALESCE(c.name, NULLIF(CONCAT_WS(' + ', NULLIF(a1.title, ''), NULLIF(a2.title, '')), ''), CONCAT('Combo #', c.combo_id::text))`;
    const itemTitleExpr = `CASE WHEN b.item_type = 'Combo' THEN ${comboTitleExpr} ELSE a.title END`;

    // ── Search (ref, order_ref, user name, email, phone) ──
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      where.push(`(
        b.booking_ref ILIKE $${i}
        OR ord.order_ref ILIKE $${i}
        OR u.name ILIKE $${i}
        OR u.email ILIKE $${i}
        OR u.phone ILIKE $${i}
        OR a.title ILIKE $${i}
        OR CAST(b.booking_id AS TEXT) = $${i + 1}
        OR CAST(b.order_id AS TEXT) = $${i + 1}
      )`);
      params.push(term, search.trim());
      i += 2;
    }

    // ── Payment status ──
    if (payment_status && ['Pending', 'Completed', 'Failed', 'Cancelled', 'INITIATED', 'SUCCESS', 'TIMED_OUT'].includes(payment_status)) {
      where.push(`b.payment_status = $${i}`);
      params.push(payment_status);
      i++;
    }

    // ── Booking status ──
    if (booking_status && ['Booked', 'Redeemed', 'Expired', 'Cancelled', 'PENDING_PAYMENT', 'CONFIRMED', 'ABANDONED', 'REFUNDED'].includes(booking_status)) {
      where.push(`b.booking_status = $${i}`);
      params.push(booking_status);
      i++;
    }

    // ── User email ──
    if (user_email && user_email.trim()) {
      where.push(`u.email ILIKE $${i}`);
      params.push(`%${user_email.trim()}%`);
      i++;
    }

    // ── User phone ──
    if (user_phone && user_phone.trim()) {
      where.push(`u.phone ILIKE $${i}`);
      params.push(`%${user_phone.trim()}%`);
      i++;
    }

    // ── Attraction filter ──
    if (attractionId) {
      where.push(`b.attraction_id = $${i}`);
      params.push(attractionId);
      i++;
    }

    // ── Combo filter ──
    if (comboId) {
      where.push(`b.combo_id = $${i}`);
      params.push(comboId);
      i++;
    }

    // ── Offer filter ──
    if (offerId) {
      where.push(`b.offer_id = $${i}`);
      params.push(offerId);
      i++;
    }

    // ── Item type (Attraction / Combo) ──
    if (normalizedItemType) {
      where.push(`b.item_type = $${i}`);
      params.push(normalizedItemType);
      i++;
    }

    // ── Date range ──
    if (dateFrom) {
      where.push(`b.booking_date >= $${i}`);
      params.push(dateFrom);
      i++;
    }
    if (dateTo) {
      where.push(`b.booking_date <= $${i}`);
      params.push(dateTo);
      i++;
    }

    // ── Slot filters ──
    if (slotId) {
      where.push(`b.slot_id = $${i}`);
      params.push(slotId);
      i++;
    }
    if (slotStartTimeFilter) {
      where.push(`b.slot_start_time >= $${i}`);
      params.push(slotStartTimeFilter);
      i++;
    }
    if (slotEndTimeFilter) {
      where.push(`b.slot_end_time <= $${i}`);
      params.push(slotEndTimeFilter);
      i++;
    }

    // ── Scoped access (restrict to admin's attraction/combo scope) ──
    if (attractionScope.length && !attractionScope.includes('*')) {
      where.push(`(b.attraction_id = ANY($${i}) OR b.attraction_id IS NULL)`);
      params.push(attractionScope);
      i++;
    }
    if (comboScope.length && !comboScope.includes('*')) {
      where.push(`(b.combo_id = ANY($${i}) OR b.combo_id IS NULL)`);
      params.push(comboScope);
      i++;
    }

    // ── Only main items ──
    where.push(`b.parent_booking_id IS NULL`);

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const joins = `
      LEFT JOIN users u ON u.user_id = b.user_id
      LEFT JOIN attractions a ON a.attraction_id = b.attraction_id
      LEFT JOIN combos c ON c.combo_id = b.combo_id
      LEFT JOIN attractions a1 ON a1.attraction_id = c.attraction_1_id
      LEFT JOIN attractions a2 ON a2.attraction_id = c.attraction_2_id
      LEFT JOIN offers o ON o.offer_id = b.offer_id
      LEFT JOIN orders ord ON ord.order_id = b.order_id
    `;

    const dataSql = `
      SELECT
        b.*,
        ord.order_ref,
        ord.payment_mode AS order_payment_mode,
        ord.payment_ref AS order_payment_ref,
        ord.payment_txn_no AS order_payment_txn_no,
        u.name AS user_name,
        u.email AS user_email,
        u.phone AS user_phone,
        a.title AS attraction_title,
        ${comboTitleExpr} AS combo_title,
        o.title AS offer_title,
        ${itemTitleExpr} AS item_title,
        b.ticket_status,
        b.slot_start_time,
        b.slot_end_time,
        b.slot_label
      FROM bookings b
      ${joins}
      ${whereSql}
      ORDER BY b.created_at DESC
      LIMIT $${i} OFFSET $${i + 1}
    `;
    const countSql = `
      SELECT COUNT(*)::int AS count
      FROM bookings b
      ${joins}
      ${whereSql}
    `;

    console.timeEnd('BookingsList Query Build');
    console.time('BookingsList DB Queries');

    const [rowsRes, countRes] = await Promise.all([
      pool.query(dataSql, [...params, l, off]),
      pool.query(countSql, params),
    ]);

    console.timeEnd('BookingsList DB Queries');
    console.log(`BookingsList: Fetched ${rowsRes.rows.length} rows, total ${countRes.rows[0]?.count || 0}`);

    // Get addons for all bookings in one query
    const bookingIds = rowsRes.rows.map(row => row.booking_id);
    let addonsMap = {};
    if (bookingIds.length > 0) {
      const addonsRes = await pool.query(
        `SELECT ba.booking_id, ba.*, ad.title AS addon_title, ad.description AS addon_description
         FROM booking_addons ba
         JOIN addons ad ON ad.addon_id = ba.addon_id
         WHERE ba.booking_id = ANY($1)
         ORDER BY ba.booking_id, ad.title ASC`,
        [bookingIds]
      );
      addonsMap = addonsRes.rows.reduce((map, addon) => {
        if (!map[addon.booking_id]) map[addon.booking_id] = [];
        map[addon.booking_id].push({
          booking_addon_id: addon.booking_addon_id,
          addon_id: addon.addon_id,
          quantity: addon.quantity,
          price: addon.price,
          title: addon.addon_title,
          description: addon.addon_description
        });
        return map;
      }, {});
    }

    // Group bookings by order_id for consolidated view
    const orderMap = new Map();
    for (const row of rowsRes.rows) {
      const key = row.order_id || row.booking_id;
      if (!orderMap.has(key)) {
        orderMap.set(key, {
          order_id: row.order_id,
          order_ref: row.order_ref || row.booking_ref,
          user_name: row.user_name,
          user_email: row.user_email,
          user_phone: row.user_phone,
          booking_date: row.booking_date,
          payment_status: row.payment_status,
          booking_status: row.booking_status,
          payment_mode: row.order_payment_mode || row.payment_mode,
          payment_ref: row.order_payment_ref || row.payment_ref,
          created_at: row.created_at,
          updated_at: row.updated_at,
          total_amount: 0,
          final_amount: 0,
          items: [],
        });
      }
      const orderGroup = orderMap.get(key);
      const itemTitle = row.item_title || row.attraction_title || row.combo_title || 'Ticket';
      orderGroup.items.push({
        booking_id: row.booking_id,
        booking_ref: row.booking_ref,
        item_type: row.item_type,
        item_title: itemTitle,
        attraction_title: row.attraction_title,
        combo_title: row.combo_title,
        quantity: row.quantity,
        total_amount: Number(row.total_amount || 0),
        final_amount: Number(row.final_amount || row.total_amount || 0),
        discount_amount: Number(row.discount_amount || 0),
        booking_status: row.booking_status,
        payment_status: row.payment_status,
        slot_start_time: row.slot_start_time,
        slot_end_time: row.slot_end_time,
        slot_label: row.slot_label,
        offer_title: row.offer_title,
        ticket_pdf: row.ticket_pdf,
        whatsapp_sent: row.whatsapp_sent,
        email_sent: row.email_sent,
        ticket_status: row.ticket_status || 'NOT_REDEEMED',
        addons: addonsMap[row.booking_id] || [],
      });
      orderGroup.total_amount += Number(row.total_amount || 0);
      orderGroup.final_amount += Number(row.final_amount || row.total_amount || 0);
    }

    // Flatten to array and build combined item_title
    const grouped = Array.from(orderMap.values()).map(order => {
      // Use the most meaningful ticket_status from items
      const anyRedeemed = order.items.some(it => it.ticket_status === 'REDEEMED');
      const allRedeemed = order.items.every(it => it.ticket_status === 'REDEEMED');
      return {
        ...order,
        item_title: order.items.map(it => it.item_title).filter(Boolean).join(', '),
        item_count: order.items.length,
        quantity: order.items.reduce((s, it) => s + (it.quantity || 1), 0),
        ticket_status: allRedeemed ? 'REDEEMED' : (anyRedeemed ? 'PARTIAL' : 'NOT_REDEEMED'),
        // Keep first booking_id for compatibility
        booking_id: order.items[0]?.booking_id,
        booking_ref: order.items[0]?.booking_ref,
      };
    });

    const total = Number(countRes.rows[0]?.count || 0);
    res.json({
      data: grouped,
      meta: { page: p, limit: l, total, totalPages: Math.max(1, Math.ceil(total / l) || 1) },
    });
  } catch (err) {
    next(err);
  }
}

exports.getBookingById = async function getBookingById(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid booking ID' });
    }
    const comboTitleExpr = `COALESCE(c.name, NULLIF(CONCAT_WS(' + ', NULLIF(a1.title, ''), NULLIF(a2.title, '')), ''), CONCAT('Combo #', c.combo_id::text))`;
    const itemTitleExpr = `CASE WHEN b.item_type = 'Combo' THEN ${comboTitleExpr} ELSE a.title END`;

    // First try to find as booking_id, then as order_id
    let orderId = null;
    const bookingCheck = await pool.query('SELECT order_id FROM bookings WHERE booking_id = $1', [id]);
    if (bookingCheck.rows.length) {
      orderId = bookingCheck.rows[0].order_id;
    } else {
      // Maybe it's an order_id directly
      const orderCheck = await pool.query('SELECT order_id FROM orders WHERE order_id = $1', [id]);
      if (orderCheck.rows.length) {
        orderId = id;
      } else {
        return res.status(404).json({ error: 'Booking not found' });
      }
    }

    // Fetch order details
    const orderRes = await pool.query(
      `SELECT o.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone
       FROM orders o
       LEFT JOIN users u ON u.user_id = o.user_id
       WHERE o.order_id = $1`, [orderId]
    );
    if (!orderRes.rows.length) return res.status(404).json({ error: 'Order not found' });
    const order = orderRes.rows[0];

    // Fetch all bookings (items) in this order
    const itemsSql = `
      SELECT
        b.*,
        a.title AS attraction_title,
        ${comboTitleExpr} AS combo_title,
        ${itemTitleExpr} AS item_title,
        o2.title AS offer_title,
        b.slot_start_time,
        b.slot_end_time,
        b.slot_label
      FROM bookings b
      LEFT JOIN attractions a ON a.attraction_id = b.attraction_id
      LEFT JOIN combos c ON c.combo_id = b.combo_id
      LEFT JOIN attractions a1 ON a1.attraction_id = c.attraction_1_id
      LEFT JOIN attractions a2 ON a2.attraction_id = c.attraction_2_id
      LEFT JOIN offers o2 ON o2.offer_id = b.offer_id
      WHERE b.order_id = $1 AND b.parent_booking_id IS NULL
      ORDER BY b.created_at ASC
    `;
    const itemsRes = await pool.query(itemsSql, [orderId]);

    // Fetch addons for all items
    const bookingIds = itemsRes.rows.map(r => r.booking_id);
    let addonsMap = {};
    if (bookingIds.length > 0) {
      const addonsRes = await pool.query(
        `SELECT ba.booking_id, ba.*, ad.title AS addon_title, ad.description AS addon_description
         FROM booking_addons ba
         JOIN addons ad ON ad.addon_id = ba.addon_id
         WHERE ba.booking_id = ANY($1)
         ORDER BY ba.booking_id, ad.title ASC`,
        [bookingIds]
      );
      addonsMap = addonsRes.rows.reduce((map, addon) => {
        if (!map[addon.booking_id]) map[addon.booking_id] = [];
        map[addon.booking_id].push({
          booking_addon_id: addon.booking_addon_id,
          addon_id: addon.addon_id,
          quantity: addon.quantity,
          price: addon.price,
          title: addon.addon_title,
          description: addon.addon_description
        });
        return map;
      }, {});
    }

    const items = itemsRes.rows.map(row => ({
      booking_id: row.booking_id,
      booking_ref: row.booking_ref,
      item_type: row.item_type,
      item_title: row.item_title || row.attraction_title || row.combo_title || 'Ticket',
      attraction_title: row.attraction_title,
      combo_title: row.combo_title,
      quantity: row.quantity,
      total_amount: Number(row.total_amount || 0),
      final_amount: Number(row.final_amount || row.total_amount || 0),
      discount_amount: Number(row.discount_amount || 0),
      booking_status: row.booking_status,
      payment_status: row.payment_status,
      ticket_status: row.ticket_status || 'NOT_REDEEMED',
      booking_date: row.booking_date,
      slot_start_time: row.slot_start_time,
      slot_end_time: row.slot_end_time,
      slot_label: row.slot_label,
      offer_title: row.offer_title,
      ticket_pdf: row.ticket_pdf,
      whatsapp_sent: row.whatsapp_sent,
      email_sent: row.email_sent,
      addons: addonsMap[row.booking_id] || [],
      created_at: row.created_at,
    }));

    // Fetch activity log
    const activityRes = await pool.query(
      `SELECT * FROM booking_activity_log
       WHERE order_id = $1
       ORDER BY created_at ASC`,
      [orderId]
    );

    // Scope check
    const scopes = req.user.scopes || {};
    const attractionScope = scopes.attraction || [];
    for (const item of itemsRes.rows) {
      if (item.attraction_id && attractionScope.length && !attractionScope.includes('*') && !attractionScope.includes(Number(item.attraction_id))) {
        return res.status(403).json({ error: 'Forbidden: attraction not in scope' });
      }
    }

    // Calculate totals
    const totalAmount = items.reduce((s, it) => s + it.total_amount, 0);
    const finalAmount = items.reduce((s, it) => s + it.final_amount, 0);

    res.json({
      order_id: order.order_id,
      order_ref: order.order_ref,
      user: {
        user_id: order.user_id,
        name: order.user_name,
        email: order.user_email,
        phone: order.user_phone,
      },
      payment: {
        status: order.payment_status,
        mode: order.payment_mode,
        ref: order.payment_ref,
        txn_no: order.payment_txn_no,
        method: order.payment_method,
        datetime: order.payment_datetime,
        total: totalAmount,
        paid: finalAmount,
      },
      booking_date: items[0]?.booking_date || order.created_at,
      booking_status: items[0]?.booking_status || 'PENDING_PAYMENT',
      ticket_status: items.every(it => it.ticket_status === 'REDEEMED') ? 'REDEEMED'
        : items.some(it => it.ticket_status === 'REDEEMED') ? 'PARTIAL' : 'NOT_REDEEMED',
      items,
      activity: activityRes.rows.map(log => ({
        log_id: log.log_id,
        event_type: log.event_type,
        event_detail: log.event_detail,
        old_value: log.old_value,
        new_value: log.new_value,
        performed_by: log.performed_by,
        created_at: log.created_at,
      })),
      created_at: order.created_at,
      updated_at: order.updated_at,
    });
  } catch (err) {
    next(err);
  }
}

exports.createManualBooking = async function createManualBooking(req, res, next) {
  try {
    const {
      user_id = null,
      attraction_id,
      slot_id = null,
      quantity = 1,
      addons = [],
      coupon_code = null,
      payment_mode = 'Offline',
      booking_date = null,
      markPaid = false,
    } = req.body || {};

    // Scope check
    const scopes = req.user.scopes || {};
    const attractionScope = scopes.attraction || [];
    if (attraction_id && attractionScope.length && !attractionScope.includes('*') && !attractionScope.includes(Number(attraction_id))) {
      return res.status(403).json({ error: 'Forbidden: attraction not in scope' });
    }

    const booking = await bookingService.createBooking({
      user_id,
      attraction_id,
      slot_id,
      quantity,
      addons,
      coupon_code,
      payment_mode,
      booking_date,
      performedBy: req.user.email
    });

    // Add user to Interakt contacts if phone exists
    if (user_id) {
      try {
        const userRes = await pool.query('SELECT name, phone, email FROM users WHERE user_id = $1', [user_id]);
        const user = userRes.rows[0];
        if (user && user.phone) {
          await interaktService.addContact({
            phone: user.phone,
            name: user.name,
            email: user.email,
            userId: user_id
          });
        }
      } catch (e) {
        console.error('Failed to add Interakt contact:', e?.message || e);
      }
    }

    if (markPaid) {
      await withTransaction(async (client) => {
        if (req.user?.email) {
          await client.query(`SELECT set_config('app.current_user', $1, true)`, [req.user.email]);
        }
        await bookingsModel.setPayment(booking.booking_id, {
          payment_status: 'Completed',
          payment_ref: booking.booking_ref,
        }, { client });
        
        // PDF generated on-the-fly when needed — no file storage
        try {
          const sent = await interaktService.sendTicketForBooking(booking.booking_id);
          if (sent && sent.success) {
            await bookingsModel.updateBooking(booking.booking_id, { whatsapp_sent: true }, { client });
          }
        } catch (e) {
          console.error('Failed to send WhatsApp ticket (createManualBooking):', e?.message || e);
        }
      });
    }

    res.status(201).json(booking);
  } catch (err) {
    next(err);
  }
}

exports.updateBooking = async function updateBooking(req, res, next) {
  try {
    const id = Number(req.params.id);

    // Try to find as booking_id first, then as order_id
    let current = await bookingsModel.getBookingById(id);
    let resolvedBookingId = id;
    let resolvedOrderId = current?.order_id || null;

    if (!current) {
      // Maybe it's an order_id — find first booking in that order
      const orderCheck = await pool.query(
        'SELECT booking_id, order_id FROM bookings WHERE order_id = $1 ORDER BY booking_id ASC LIMIT 1',
        [id]
      );
      if (orderCheck.rows.length) {
        resolvedBookingId = orderCheck.rows[0].booking_id;
        resolvedOrderId = orderCheck.rows[0].order_id;
        current = await bookingsModel.getBookingById(resolvedBookingId);
      }
    }

    if (!current) return res.status(404).json({ error: 'Booking not found' });

    const scopes = req.user.scopes || {};
    const attractionScope = scopes.attraction || [];
    const targetAttractionId = req.body?.attraction_id != null ? Number(req.body.attraction_id) : current.attraction_id;
    if (targetAttractionId && attractionScope.length && !attractionScope.includes('*') && !attractionScope.includes(Number(targetAttractionId))) {
      return res.status(403).json({ error: 'Forbidden: attraction not in scope' });
    }

    const allowed = [
      'user_id',
      'attraction_id',
      'slot_id',
      'booking_date',
      'booking_time',
      'total_amount',
      'discount_amount',
      'payment_status',
      'payment_mode',
      'payment_ref',
      'booking_status',
      'ticket_status',
      'ticket_pdf',
      'whatsapp_sent',
      'email_sent',
    ];
    const payload = {};
    for (const k of allowed) {
      if (!req.body || req.body[k] === undefined) continue;
      const value = req.body[k];
      if (typeof value === 'string' && value.trim() === '') continue;
      payload[k] = value;
    }

    console.log('🔍 DEBUG admin update payload:', payload, { resolvedBookingId, resolvedOrderId });

    // Optional guard: require payment_ref if marking Completed
    if (payload.payment_status === 'Completed' && !payload.payment_ref) {
      return res.status(400).json({ error: 'payment_ref is required for Completed payments' });
    }

    // Ticket status validation: can only be changed to REDEEMED if booking is CONFIRMED
    if (payload.ticket_status && payload.ticket_status === 'REDEEMED') {
      const currentBooking = current || await bookingsModel.getBookingById(resolvedBookingId);
      if (currentBooking && (currentBooking.booking_status !== 'CONFIRMED' && currentBooking.booking_status !== 'Booked')) {
        return res.status(400).json({ error: 'Ticket can only be redeemed when booking status is CONFIRMED or Booked' });
      }
    }

    // Use withTransaction to ensure SET LOCAL and UPDATE happen in same session for trigger
    const result = await withTransaction(async (client) => {
      // 1. Set current user for trigger
      if (req.user?.email) {
        await client.query(`SELECT set_config('app.current_user', $1, true)`, [req.user.email]);
      }

      let updatedRecord = null;

      // 2. If propagate: update ALL bookings in the order
      if (req.body.propagate && resolvedOrderId) {
        // Propagate booking_status if provided
        if (payload.booking_status) {
          const resProp = await client.query(
            `UPDATE bookings SET booking_status = $1, updated_at = NOW()
             WHERE order_id = $2
             RETURNING booking_id`,
            [payload.booking_status, resolvedOrderId]
          );
          console.log(`✅ Propagated booking_status="${payload.booking_status}" to ${resProp.rowCount} bookings in order_id=${resolvedOrderId}`);
        }
        // Propagate ticket_status if provided
        if (payload.ticket_status) {
          const resProp = await client.query(
            `UPDATE bookings SET ticket_status = $1, updated_at = NOW()
             WHERE order_id = $2
             RETURNING booking_id`,
            [payload.ticket_status, resolvedOrderId]
          );
          console.log(`✅ Propagated ticket_status="${payload.ticket_status}" to ${resProp.rowCount} bookings in order_id=${resolvedOrderId}`);
        }
        
        // Manual logs for propagation are still needed if we want specific detail text like "(Propagated)"
        // But the trigger will already have caught the status change. 
        // To avoid double-logging, we rely purely on the trigger.
        
        updatedRecord = await bookingsModel.getBookingById(resolvedBookingId);
      } else {
        // 3. Non-propagating update: single booking only
        updatedRecord = await bookingsModel.updateBooking(resolvedBookingId, payload, { client });
      }

      return updatedRecord;
    });

    if (!result) return res.status(404).json({ error: 'Booking not found or not updated' });

    // 4. Handle side effects (outside transaction)
    if (payload.payment_status === 'Completed') {
      try {
        const sent = await interaktService.sendTicketForBooking(resolvedBookingId);
        if (sent && sent.success) {
          await withTransaction(async (client) => {
            if (req.user?.email) {
              await client.query(`SELECT set_config('app.current_user', $1, true)`, [req.user.email]);
            }
            await bookingsModel.updateBooking(resolvedBookingId, { whatsapp_sent: true }, { client });
          });
        }
      } catch (e) {
        console.error('Failed to send WhatsApp ticket (updateBooking):', e?.message || e);
      }
    }
    
    res.json(result);
  } catch (err) {
    next(err);
  }
}

exports.resendTicket = async function resendTicket(req, res, next) {
  try {
    const id = Number(req.params.id);
    const booking = await bookingsModel.getBookingById(id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Scope check
    const scopes = req.user.scopes || {};
    const attractionScope = scopes.attraction || [];
    if (booking.attraction_id && attractionScope.length && !attractionScope.includes('*') && !attractionScope.includes(Number(booking.attraction_id))) {
      return res.status(403).json({ error: 'Forbidden: attraction not in scope' });
    }

    if (!booking.user_id) {
      return res.status(400).json({ error: 'Cannot resend ticket without user information' });
    }

    // Use withTransaction to set current user for trigger
    const finalResult = await withTransaction(async (client) => {
      if (req.user?.email) {
        await client.query(`SELECT set_config('app.current_user', $1, true)`, [req.user.email]);
      }

      // Generate PDF on-the-fly — no file storage
      await bookingsModel.updateBooking(id, { email_sent: false }, { client });
      const emailRes = await ticketEmailService.sendTicketEmail(id);

      // Also send WhatsApp
      let whatsappRes = null;
      try {
        const sent = await interaktService.sendTicketForBookingInstant(id, true);
        if (sent && sent.success) {
          await bookingsModel.updateBooking(id, { whatsapp_sent: true }, { client });
          whatsappRes = sent;
        } else {
          whatsappRes = { success: false, reason: sent?.reason || 'Send failed' };
        }
      } catch (e) {
        console.error('Failed to resend WhatsApp ticket:', e?.message || e);
        whatsappRes = { success: false, error: e?.message || 'Unknown error' };
      }

      // Log resend action
      await logAdminActivity(booking.order_id, id, 'ticket_resent', 'Ticket resent (Email & WhatsApp)', null, null, req.user.email);

      return { email: emailRes, whatsapp: whatsappRes };
    });

    res.json({ success: true, ...finalResult });
  } catch (err) {
    next(err);
  }
}

exports.resendWhatsApp = async function resendWhatsApp(req, res, next) {
  try {
    const id = Number(req.params.id);
    const booking = await bookingsModel.getBookingById(id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Scope check
    const scopes = req.user.scopes || {};
    const attractionScope = scopes.attraction || [];
    if (booking.attraction_id && attractionScope.length && !attractionScope.includes('*') && !attractionScope.includes(Number(booking.attraction_id))) {
      return res.status(403).json({ error: 'Forbidden: attraction not in scope' });
    }

    if (!booking.user_id) {
      return res.status(400).json({ error: 'Cannot resend WhatsApp without user information' });
    }

    // Use withTransaction to set current user for trigger
    try {
      const sent = await interaktService.sendTicketForBookingInstant(id, true);
      if (sent && sent.success) {
        await withTransaction(async (client) => {
          if (req.user?.email) {
            await client.query(`SELECT set_config('app.current_user', $1, true)`, [req.user.email]);
          }
          await bookingsModel.updateBooking(id, { whatsapp_sent: true }, { client });
          // Log resend WhatsApp
          await logAdminActivity(booking.order_id, id, 'whatsapp_sent', 'WhatsApp ticket resent', null, null, req.user.email);
        });
      }
      return res.json({ success: true, whatsapp: sent });
    } catch (e) {
      console.error('Failed to resend WhatsApp ticket:', e?.message || e);
      return res.status(502).json({ success: false, error: e?.message || 'Failed to send WhatsApp' });
    }
  } catch (err) {
    next(err);
  }
}

exports.resendEmail = async function resendEmail(req, res, next) {
  try {
    const id = Number(req.params.id);
    const booking = await bookingsModel.getBookingById(id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Scope check
    const scopes = req.user.scopes || {};
    const attractionScope = scopes.attraction || [];
    if (booking.attraction_id && attractionScope.length && !attractionScope.includes('*') && !attractionScope.includes(Number(booking.attraction_id))) {
      return res.status(403).json({ error: 'Forbidden: attraction not in scope' });
    }

    if (!booking.user_id) {
      return res.status(400).json({ error: 'Cannot resend email without user information' });
    }

    // Use withTransaction to set current user for trigger
    try {
      const result = await withTransaction(async (client) => {
        if (req.user?.email) {
          await client.query(`SELECT set_config('app.current_user', $1, true)`, [req.user.email]);
        }
        await bookingsModel.updateBooking(id, { email_sent: false }, { client });
        const emailRes = await ticketEmailService.sendTicketEmail(id);
        // Log resend Email
        await logAdminActivity(booking.order_id, id, 'email_sent', 'Email ticket resent', null, null, req.user.email);
        return emailRes;
      });
      return res.json({ success: true, email: result });
    } catch (e) {
      console.error('Failed to resend ticket email:', e?.message || e);
      return res.status(502).json({ success: false, error: e?.message || 'Failed to send email' });
    }
  } catch (err) {
    next(err);
  }
}

// Download Ticket PDF (generated on-the-fly, never stored)
exports.downloadTicket = async function downloadTicket(req, res, next) {
  try {
    const id = Number(req.params.id);
    const booking = await bookingsModel.getBookingById(id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

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
}

exports.sendTestEmail = async function sendTestEmail(req, res, next) {
  try {
    const id = Number(req.params.id);
    const booking = await bookingsModel.getBookingById(id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    // Scope check
    const scopes = req.user.scopes || {};
    const attractionScope = scopes.attraction || [];
    if (booking.attraction_id && attractionScope.length && !attractionScope.includes('*') && !attractionScope.includes(Number(booking.attraction_id))) {
      return res.status(403).json({ error: 'Forbidden: attraction not in scope' });
    }

    if (!booking.user_id) {
      return res.status(400).json({ error: 'Cannot send test email without user information' });
    }

    const ticketEmailService = require('../../services/ticketEmailService');
    try {
      const result = await ticketEmailService.sendTicketEmail(id);
      return res.json({ success: true, result });
    } catch (e) {
      console.error('Failed to send test ticket email:', e?.message || e);
      return res.status(502).json({ success: false, error: e?.message || 'Failed to send email' });
    }
  } catch (err) {
    next(err);
  }
}

exports.cancelBooking = async function cancelBooking(req, res, next) {
  try {
    const id = Number(req.params.id);

    // Scope check
    const row = await bookingsModel.getBookingById(id);
    if (!row) return res.status(404).json({ error: 'Booking not found' });
    // Scope check
    const scopes = req.user.scopes || {};
    const attractionScope = scopes.attraction || [];
    if (row.attraction_id && attractionScope.length && !attractionScope.includes('*') && !attractionScope.includes(Number(row.attraction_id))) {
      return res.status(403).json({ error: 'Forbidden: attraction not in scope' });
    }

    const result = await withTransaction(async (client) => {
      if (req.user?.email) {
        await client.query(`SELECT set_config('app.current_user', $1, true)`, [req.user.email]);
      }
      return bookingService.cancelBooking(id);
    });

    if (!result) return res.status(404).json({ error: 'Booking not found' });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

exports.deleteBooking = async function deleteBooking(req, res, next) {
  try {
    const id = Number(req.params.id);

    // Scope check
    const row = await bookingsModel.getBookingById(id);
    if (!row) return res.status(404).json({ error: 'Booking not found' });
    // Scope check
    const scopes = req.user.scopes || {};
    const attractionScope = scopes.attraction || [];
    if (row.attraction_id && attractionScope.length && !attractionScope.includes('*') && !attractionScope.includes(Number(row.attraction_id))) {
      return res.status(403).json({ error: 'Forbidden: attraction not in scope' });
    }

    const { rowCount } = await pool.query(`DELETE FROM bookings WHERE booking_id = $1`, [id]);
    res.json({ deleted: rowCount > 0 });
  } catch (err) {
    next(err);
  }
}

exports.checkPayPhiStatusAdmin = async function checkPayPhiStatusAdmin(req, res, next) {
  try {
    const id = Number(req.params.id);

    // Scope check
    const row = await bookingsModel.getBookingById(id);
    if (!row) return res.status(404).json({ error: 'Booking not found' });
    // Scope check
    const scopes = req.user.scopes || {};
    const attractionScope = scopes.attraction || [];
    if (row.attraction_id && attractionScope.length && !attractionScope.includes('*') && !attractionScope.includes(Number(row.attraction_id))) {
      return res.status(403).json({ error: 'Forbidden: attraction not in scope' });
    }

    const out = await bookingService.checkPayPhiStatus(id);
    await createApiLog({
      endpoint: 'payphi_status_admin',
      payload: { booking_id: id, response: out.response },
      response_code: 200,
      status: out.success ? 'success' : 'failed',
    });
    res.json(out);
  } catch (err) {
    next(err);
  }
}

exports.initiatePayPhiPaymentAdmin = async function initiatePayPhiPaymentAdmin(req, res, next) {
  try {
    const id = Number(req.params.id);
    const b = await bookingsModel.getBookingById(id);
    if (!b) return res.status(404).json({ error: 'Booking not found' });

    // Scope check
    const scopes = req.user.scopes || {};
    const attractionScope = scopes.attraction || [];
    if (b.attraction_id && attractionScope.length && !attractionScope.includes('*') && !attractionScope.includes(Number(b.attraction_id))) {
      return res.status(403).json({ error: 'Forbidden: attraction not in scope' });
    }

    const { email, mobile } = (req.body && typeof req.body === 'object') ? req.body : {};
    if (!email || !mobile) return res.status(400).json({ error: 'email and mobile are required' });
    const out = await bookingService.initiatePayPhiPayment(id, { email, mobile, addlParam1: String(id), addlParam2: 'SnowCity' });
    res.json(out);
  } catch (err) {
    next(err);
  }
}

exports.refundPayPhi = async function refundPayPhi(req, res, next) {
  try {
    const id = Number(req.params.id);
    const b = await bookingsModel.getBookingById(id);
    if (!b) return res.status(404).json({ error: 'Booking not found' });

    // Scope check
    const scopes = req.user.scopes || {};
    const attractionScope = scopes.attraction || [];
    if (b.attraction_id && attractionScope.length && !attractionScope.includes('*') && !attractionScope.includes(Number(b.attraction_id))) {
      return res.status(403).json({ error: 'Forbidden: attraction not in scope' });
    }

    if (b.payment_status !== 'Completed') return res.status(400).json({ error: 'Cannot refund: payment is not completed' });

    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'amount must be positive' });

    const newMerchantTxnNo = req.body?.newMerchantTxnNo || `${b.booking_ref}R${Date.now().toString().slice(-6)}`;
    const { success, raw } = await payphiService.refund({
      newMerchantTxnNo,
      originalTxnNo: b.booking_ref,
      amount,
    });

    await createApiLog({
      endpoint: 'payphi_refund_admin',
      payload: { booking_id: id, newMerchantTxnNo, originalTxnNo: b.booking_ref, amount, response: raw },
      response_code: 200,
      status: success ? 'success' : 'failed',
    });

    res.json({ success, newMerchantTxnNo, response: raw });
  } catch (err) {
    next(err);
  }
}

// Calendar view - bookings grouped by date
exports.getBookingCalendar = async (req, res, next) => {
  try {
    const { from, to, attraction_id, combo_id } = req.query;

    // Scoping
    const scopes = req.user.scopes || {};
    const attractionScope = scopes.attraction || [];
    const comboScope = scopes.combo || [];

    // Validate scope filters
    if (attraction_id && attractionScope.length && !attractionScope.includes('*') && !attractionScope.includes(Number(attraction_id))) {
      return res.status(403).json({ error: 'Forbidden: attraction not in scope' });
    }
    if (combo_id && comboScope.length && !comboScope.includes('*') && !comboScope.includes(Number(combo_id))) {
      return res.status(403).json({ error: 'Forbidden: combo not in scope' });
    }

    const bookings = await bookingsModel.getBookingsCalendar({
      from: from || null,
      to: to || null,
      attraction_id: attraction_id ? Number(attraction_id) : null,
      combo_id: combo_id ? Number(combo_id) : null,
      attractionScope: attractionScope.includes('*') ? null : attractionScope,
      comboScope: comboScope.includes('*') ? null : comboScope,
    });

    res.json(bookings);
  } catch (err) {
    next(err);
  }
};

// Slots summary - available/booked slots per attraction/combo
exports.getBookingSlots = async (req, res, next) => {
  try {
    const { date, attraction_id, combo_id } = req.query;

    // Scoping
    const scopes = req.user.scopes || {};
    const attractionScope = scopes.attraction || [];
    const comboScope = scopes.combo || [];

    // Validate scope filters
    if (attraction_id && attractionScope.length && !attractionScope.includes('*') && !attractionScope.includes(Number(attraction_id))) {
      return res.status(403).json({ error: 'Forbidden: attraction not in scope' });
    }
    if (combo_id && comboScope.length && !comboScope.includes('*') && !comboScope.includes(Number(combo_id))) {
      return res.status(403).json({ error: 'Forbidden: combo not in scope' });
    }

    const slots = await bookingsModel.getBookingSlotsSummary({
      date: date || null,
      attraction_id: attraction_id ? Number(attraction_id) : null,
      combo_id: combo_id ? Number(combo_id) : null,
      attractionScope: attractionScope.includes('*') ? null : attractionScope,
      comboScope: comboScope.includes('*') ? null : comboScope,
    });

    res.json(slots);
  } catch (err) {
    next(err);
  }
};
