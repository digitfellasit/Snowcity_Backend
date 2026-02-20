// admin/controllers/bookings.controller.js
const { pool } = require('../../config/db');
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

    const comboTitleExpr = `COALESCE(NULLIF(CONCAT_WS(' + ', NULLIF(a1.title, ''), NULLIF(a2.title, '')), ''), CONCAT('Combo #', c.combo_id::text))`;
    const itemTitleExpr = `CASE WHEN b.item_type = 'Combo' THEN ${comboTitleExpr} ELSE a.title END`;

    // ... existing where building ...

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const joins = `
      LEFT JOIN users u ON u.user_id = b.user_id
      LEFT JOIN attractions a ON a.attraction_id = b.attraction_id
      LEFT JOIN combos c ON c.combo_id = b.combo_id
      LEFT JOIN attractions a1 ON a1.attraction_id = c.attraction_1_id
      LEFT JOIN attractions a2 ON a2.attraction_id = c.attraction_2_id
      LEFT JOIN offers o ON o.offer_id = b.offer_id
    `;

    const dataSql = `
      SELECT
        b.*,
        u.name AS user_name,
        u.email AS user_email,
        u.phone AS user_phone,
        a.title AS attraction_title,
        ${comboTitleExpr} AS combo_title,
        o.title AS offer_title,
        ${itemTitleExpr} AS item_title,
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

    // ... rest of the function ...

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

    // Build bookings with addons
    const bookings = rowsRes.rows.map(bookingRow => ({
      ...bookingRow,
      addons: addonsMap[bookingRow.booking_id] || []
    }));

    const total = Number(countRes.rows[0]?.count || 0);
    res.json({
      data: bookings,
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
    const comboTitleExpr = `COALESCE(NULLIF(CONCAT_WS(' + ', NULLIF(a1.title, ''), NULLIF(a2.title, '')), ''), CONCAT('Combo #', c.combo_id::text))`;
    const itemTitleExpr = `CASE WHEN b.item_type = 'Combo' THEN ${comboTitleExpr} ELSE a.title END`;
    const detailSql = `
      SELECT
        b.*,
        u.name AS user_name,
        u.email AS user_email,
        u.phone AS user_phone,
        a.title AS attraction_title,
        ${comboTitleExpr} AS combo_title,
        ${itemTitleExpr} AS item_title,
        o.title AS offer_title,
        COALESCE(s.start_time, cs.start_time) AS slot_start_time,
        COALESCE(s.end_time, cs.end_time)   AS slot_end_time
      FROM bookings b
      LEFT JOIN users u ON u.user_id = b.user_id
      LEFT JOIN attractions a ON a.attraction_id = b.attraction_id
      LEFT JOIN combos c ON c.combo_id = b.combo_id
      LEFT JOIN attractions a1 ON a1.attraction_id = c.attraction_1_id
      LEFT JOIN attractions a2 ON a2.attraction_id = c.attraction_2_id
      LEFT JOIN offers o ON o.offer_id = b.offer_id
      LEFT JOIN attraction_slots s ON s.slot_id = b.slot_id
      LEFT JOIN combo_slots cs ON cs.combo_slot_id = b.combo_slot_id
      WHERE b.booking_id = $1
    `;
    const { rows } = await pool.query(detailSql, [id]);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Booking not found' });

    // Scope check
    const scopes = req.user.scopes || {};
    const attractionScope = scopes.attraction || [];
    if (row.attraction_id && attractionScope.length && !attractionScope.includes('*') && !attractionScope.includes(Number(row.attraction_id))) {
      return res.status(403).json({ error: 'Forbidden: attraction not in scope' });
    }

    res.json(row);
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
      await bookingsModel.setPayment(booking.booking_id, {
        payment_status: 'Completed',
        payment_ref: booking.booking_ref,
      });
      // PDF generated on-the-fly when needed — no file storage
      try {
        const sent = await interaktService.sendTicketForBooking(booking.booking_id);
        if (sent && sent.success) {
          await bookingsModel.updateBooking(booking.booking_id, { whatsapp_sent: true });
        }
      } catch (e) {
        console.error('Failed to send WhatsApp ticket (createManualBooking):', e?.message || e);
      }
    }

    res.status(201).json(booking);
  } catch (err) {
    next(err);
  }
}

exports.updateBooking = async function updateBooking(req, res, next) {
  try {
    const id = Number(req.params.id);

    // Load current and scope-check
    const current = await bookingsModel.getBookingById(id);
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

    console.log('🔍 DEBUG admin update payload:', payload);

    // Optional guard: require payment_ref if marking Completed
    if (payload.payment_status === 'Completed' && !payload.payment_ref) {
      return res.status(400).json({ error: 'payment_ref is required for Completed payments' });
    }

    const updated = await bookingsModel.updateBooking(id, payload);
    if (!updated) return res.status(404).json({ error: 'Booking not found' });

    if (payload.payment_status === 'Completed') {
      // PDF generated on-the-fly when needed — no file storage
      try {
        const sent = await interaktService.sendTicketForBooking(id);
        if (sent && sent.success) {
          await bookingsModel.updateBooking(id, { whatsapp_sent: true });
        }
      } catch (e) {
        console.error('Failed to send WhatsApp ticket (updateBooking):', e?.message || e);
      }
    }
    res.json(updated);
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

    // Generate PDF on-the-fly — no file storage
    await bookingsModel.updateBooking(id, { email_sent: false });
    const result = await ticketEmailService.sendTicketEmail(id);

    // Also send WhatsApp
    let whatsappResult = null;
    try {
      const sent = await interaktService.sendTicketForBookingInstant(id, true);
      if (sent && sent.success) {
        await bookingsModel.updateBooking(id, { whatsapp_sent: true });
        whatsappResult = sent;
      } else {
        whatsappResult = { success: false, reason: sent?.reason || 'Send failed' };
      }
    } catch (e) {
      console.error('Failed to resend WhatsApp ticket:', e?.message || e);
      whatsappResult = { success: false, error: e?.message || 'Unknown error' };
    }

    res.json({ success: true, email: result, whatsapp: whatsappResult });
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

    // PDF generated on-the-fly — no file storage
    try {
      const sent = await interaktService.sendTicketForBookingInstant(id, true);
      if (sent && sent.success) {
        await bookingsModel.updateBooking(id, { whatsapp_sent: true });
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

    // PDF generated on-the-fly — no file storage
    await bookingsModel.updateBooking(id, { email_sent: false });
    try {
      const result = await ticketEmailService.sendTicketEmail(id);
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

    const updated = await bookingService.cancelBooking(id);
    if (!updated) return res.status(404).json({ error: 'Booking not found' });
    res.json(updated);
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
