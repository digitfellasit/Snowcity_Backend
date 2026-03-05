"use strict";

const axios = require('axios');
const { pool } = require('../config/db');
const { APP_URL, interakt } = require('../config/messaging');

const INTERAKT_URL = interakt?.apiUrl || process.env.INTERAKT_API_URL || 'https://api.interakt.ai/v1/public/message/';
const INTERAKT_KEY = interakt?.apiKey || process.env.INTERAKT_API_KEY || null;
const INTERAKT_SENDER = interakt?.sender || process.env.INTERAKT_SENDER || null;
const FIXED_APP_URL = APP_URL ? APP_URL.split(',')[0].trim() : null;

function formatTime12h(t) {
  if (!t) return '';
  const timeStr = String(t).trim();

  // Handle various time formats
  let onlyTime = timeStr;
  if (timeStr.includes('T')) {
    onlyTime = timeStr.split('T')[1] || timeStr;
  } else if (timeStr.includes(' ')) {
    onlyTime = timeStr.split(' ')[0];
  }

  // Remove any trailing timezone info
  onlyTime = onlyTime.split('.')[0];

  const parts = onlyTime.split(':');
  if (parts.length < 2) return '';

  const h = Number(parts[0]);
  const m = Number(parts[1]);

  if (Number.isNaN(h) || Number.isNaN(m)) return '';

  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;

  if (m === 0) {
    return `${h12}${ampm}`;
  }
  return `${h12}:${String(m).padStart(2, '0')}${ampm}`;
}

function formatDateIN(d) {
  if (!d) return '';
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });
  } catch {
    return '';
  }
}

function formatSlotRange(row) {
  // Only use actual slot times, NOT booking_time (which is just when the booking was created)
  const start = formatTime12h(row?.slot_start_time || row?.start_time);
  const end = formatTime12h(row?.slot_end_time || row?.end_time);

  if (start && end) {
    return `${start}–${end}`;
  }
  if (start) {
    return start;
  }
  if (row?.slot_label) {
    return String(row.slot_label);
  }
  return '';
}

function resolveMediaUrl(ticketPath) {
  const base = FIXED_APP_URL || 'https://app.snowcityblr.com';
  if (!ticketPath) return null;
  if (/^https?:/i.test(ticketPath)) return ticketPath;

  // Ensure we don't end up with https://app.snowcityblr.com//uploads
  const cleanBase = base.replace(/\/$/, '');
  const cleanPath = String(ticketPath).startsWith('/') ? ticketPath : `/${ticketPath}`;

  const finalUrl = `${cleanBase}${cleanPath}`;
  console.log('[Interakt] Resolved Media URL:', finalUrl);
  return finalUrl;
}

function normalizePhone(p) {
  if (!p) return null;
  let s = String(p).trim();
  s = s.replace(/[^0-9]/g, '');
  if (s.startsWith('91') && s.length === 12) {
    return { countryCode: '+91', phoneNumber: s.slice(2) };
  } else if (s.length === 10) {
    return { countryCode: '+91', phoneNumber: s };
  } else if (s.length > 10) {
    return { countryCode: '+91', phoneNumber: s.slice(-10) };
  }
  return null;
}

async function buildTicketTemplateDataForOrder(orderId) {
  const ordRes = await pool.query(
    `SELECT o.order_id, o.order_ref, o.user_id, o.total_amount, o.final_amount, 
            u.name AS user_name, u.phone, u.whatsapp_consent
     FROM orders o
     LEFT JOIN users u ON u.user_id = o.user_id
     WHERE o.order_id = $1`,
    [orderId]
  );

  const ord = ordRes.rows[0];
  if (!ord) return null;

  const bookingsModel = require('../models/bookings.model');
  const order = await bookingsModel.getOrderWithDetails(orderId);
  if (!order) return null;

  const items = Array.isArray(order.items) ? order.items : [];
  const primary = items.filter((x) => !x.parent_booking_id);
  const effectiveItems = primary.length ? primary : items;

  // Group attractions by date for better formatting
  const attractionsByDate = new Map();

  effectiveItems.forEach((it) => {
    const title = it.item_title || it.attraction_title || it.combo_title || (it.item_type === 'Combo' ? 'Combo' : 'Attraction');
    const qty = Number(it.quantity || 1);
    const dateStr = formatDateIN(it.booking_date) || '';
    const slotStr = formatSlotRange(it);

    const dateKey = dateStr || 'Date TBD';

    if (!attractionsByDate.has(dateKey)) {
      attractionsByDate.set(dateKey, []);
    }

    attractionsByDate.get(dateKey).push({
      title,
      qty,
      time: slotStr
    });
  });

  // Build formatted attractions text
  const attractionLines = [];

  attractionsByDate.forEach((attractions, date) => {
    attractions.forEach(attr => {
      const timePart = attr.time ? ` | ${attr.time}` : '';
      attractionLines.push(`${attr.title} — ${date}${timePart} | ${attr.qty} guest`);
    });
  });

  const itemsText = attractionLines.length ? attractionLines.join(' || ') : 'Booking details unavailable';

  const addonMap = new Map();
  effectiveItems.forEach((it) => {
    const addons = Array.isArray(it.addons) ? it.addons : [];
    addons.forEach((a) => {
      const key = String(a.addon_id || a.title || a.addon_title || '').trim();
      if (!key) return;
      const name = a.title || a.addon_title || 'Addon';
      const qty = Number(a.quantity || 0);
      const price = Number(a.price || 0);

      if (!addonMap.has(key)) {
        addonMap.set(key, { name, qty: 0, price });
      }
      addonMap.get(key).qty += qty;
    });
  });

  const addonLines = Array.from(addonMap.values())
    .filter((x) => x.qty > 0)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map((x) => `${x.name} (${x.price}) x ${x.qty}`);
  const addonsText = addonLines.length ? addonLines.join(', ') : 'None';

  const firstTicket = (items.find((x) => x.ticket_pdf) || {}).ticket_pdf || null;
  const mediaUrl = resolveMediaUrl(firstTicket);

  const rawName = ord.user_name || 'Guest';
  const userName = rawName.trim().charAt(0).toUpperCase() + rawName.trim().slice(1);

  return {
    order_id: ord.order_id,
    order_ref: (ord.order_ref || '').trim(),
    user_name: userName,
    phone: ord.phone || null,
    whatsapp_consent: !!ord.whatsapp_consent,
    itemsText,
    addonsText,
    total_amount: `₹${Number(ord.final_amount || ord.total_amount || 0).toLocaleString('en-IN')}`,
    mediaUrl
  };
}

async function ensureTicketPdfForOrder(orderId, force = false) {
  const bRes = await pool.query(
    `SELECT booking_id, ticket_pdf FROM bookings WHERE order_id = $1 ORDER BY booking_id ASC`,
    [orderId]
  );
  const rows = bRes.rows || [];
  if (!rows.length) return null;
  const existing = rows.find((r) => r.ticket_pdf)?.ticket_pdf || null;
  if (existing && !force) return existing;

  const ticketService = require('./ticketService');
  const urlPath = await ticketService.generateTicket(rows[0].booking_id);
  if (urlPath) {
    await pool.query(
      `UPDATE bookings SET ticket_pdf = $1, updated_at = NOW() WHERE order_id = $2`,
      [urlPath, orderId]
    );
  }
  return urlPath || null;
}

async function sendTicketForOrder(orderId, { skipConsentCheck = false, force = false, instant = false } = {}) {
  if (!orderId) return { success: false, reason: 'missing-orderId' };
  if (!INTERAKT_URL || !INTERAKT_KEY) {
    console.log('Interakt not configured - skipping WhatsApp send');
    return { success: false, reason: 'not-configured' };
  }

  const sentRes = await pool.query(
    `SELECT COUNT(*)::int AS sent_count FROM bookings WHERE order_id = $1 AND whatsapp_sent = true`,
    [orderId]
  );
  const alreadySent = (sentRes.rows[0]?.sent_count || 0) > 0;
  if (alreadySent && !force) {
    return { success: false, reason: 'already-sent' };
  }

  const ensuredTicket = await ensureTicketPdfForOrder(orderId, force);
  const data = await buildTicketTemplateDataForOrder(orderId);
  if (!data) return { success: false, reason: 'order-not-found' };

  if (!skipConsentCheck && !data.whatsapp_consent) {
    console.log('User has not consented to WhatsApp - skipping send');
    return { success: false, reason: 'no-consent' };
  }
  if (!data.phone) return { success: false, reason: 'no-phone' };

  const phone = normalizePhone(data.phone);
  if (!phone) return { success: false, reason: 'invalid-phone' };

  const mediaUrl = data.mediaUrl || resolveMediaUrl(ensuredTicket);
  const fileName = data.order_ref ? `ticket-${data.order_ref}.pdf` : `ticket-order-${orderId}.pdf`;

  const payload = {
    countryCode: phone.countryCode,
    phoneNumber: phone.phoneNumber,
    callbackData: `ticket-order-${orderId}`,
    type: 'Template',
    template: {
      name: 'ticket_confirmation_js',
      languageCode: 'en',
      headerValues: mediaUrl ? [mediaUrl] : [],
      bodyValues: [
        data.user_name || 'Guest',
        data.order_ref || `order-${orderId}`,
        data.itemsText || 'Booking confirmed',
        data.addonsText || 'None',
        data.total_amount || '0'
      ]
    }
  };

  // For media templates, fileName goes inside the template object but sometimes Interakt expects it in specific places
  if (mediaUrl && fileName) {
    payload.template.fileName = fileName;
  }

  console.log('Interakt order template send payload:', JSON.stringify(payload, null, 2));

  try {
    const opts = { headers: { Authorization: `Basic ${INTERAKT_KEY}`, 'Content-Type': 'application/json' }, ...(instant ? {} : { timeout: 60000 }) };
    const res = instant
      ? await axiosPostInstant(INTERAKT_URL, payload, opts)
      : await axiosPostWithRetries(INTERAKT_URL, payload, opts, 3, 1500);
    await pool.query(`UPDATE bookings SET whatsapp_sent = true, updated_at = NOW() WHERE order_id = $1`, [orderId]);
    return { success: true, response: res.data };
  } catch (err) {
    console.error('Interakt order template send error:', err?.response?.status, err?.response?.data || err?.message || err);
    return { success: false, reason: err?.response?.status || err?.message || 'request-failed' };
  }
}

async function axiosPostWithRetries(url, payload, options = {}, retries = 3, backoffMs = 1000) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const start = Date.now();
    try {
      const res = await axios.post(url, payload, options);
      const dur = Date.now() - start;
      console.log(`axiosPostWithRetries success: ${url} attempt=${attempt} duration=${dur}ms`);
      return res;
    } catch (err) {
      const dur = Date.now() - start;
      const status = err?.response?.status || 'NO_STATUS';
      console.warn(`axiosPostWithRetries error: ${url} attempt=${attempt} duration=${dur}ms status=${status}`);
      if (attempt === retries) throw err;
      const wait = backoffMs * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

// Instant send function for admin resend operations - no timeout, no retries
async function axiosPostInstant(url, payload, options = {}) {
  const start = Date.now();
  try {
    const res = await axios.post(url, payload, { ...options, timeout: 10000 }); // 10 second timeout for instant sends
    const dur = Date.now() - start;
    console.log(`axiosPostInstant success: ${url} duration=${dur}ms`);
    return res;
  } catch (err) {
    const dur = Date.now() - start;
    const status = err?.response?.status || 'NO_STATUS';
    console.warn(`axiosPostInstant error: ${url} duration=${dur}ms status=${status}`);
    throw err;
  }
}

async function sendWhatsApp({ to, text, mediaUrl } = {}) {
  if (!INTERAKT_URL || !INTERAKT_KEY) {
    console.log('Interakt not configured - skipping WhatsApp send');
    return { success: false, reason: 'not-configured' };
  }
  if (!to) return { success: false, reason: 'missing-recipient' };

  const phone = normalizePhone(to);
  if (!phone) return { success: false, reason: 'invalid-phone' };

  const payload = {
    countryCode: phone.countryCode,
    phoneNumber: phone.phoneNumber,
    callbackData: 'ticket-send',
    type: mediaUrl ? 'Document' : 'Text',
    data: mediaUrl
      ? { message: text || 'Your ticket is attached.', mediaUrl }
      : { message: text || '' }
  };

  console.log('Interakt sending to:', phone.countryCode + phone.phoneNumber, 'payload:', JSON.stringify(payload));

  try {
    const opts = {
      headers: { Authorization: `Basic ${INTERAKT_KEY}`, 'Content-Type': 'application/json' },
      timeout: 60000
    };
    const res = await axiosPostWithRetries(INTERAKT_URL, payload, opts, 3, 1000);
    return { success: true, response: res.data };
  } catch (err) {
    console.error('Interakt send error:', err?.response?.status, err?.response?.data || err?.message || err);
    return { success: false, reason: err?.response?.status || err?.message || 'request-failed' };
  }
}

async function sendTicketForBooking(bookingId, skipConsentCheck = false) {
  if (!bookingId) return { success: false, reason: 'missing-bookingId' };
  const oRes = await pool.query(`SELECT order_id FROM bookings WHERE booking_id = $1`, [bookingId]);
  const orderId = oRes.rows[0]?.order_id || null;
  if (!orderId) return { success: false, reason: 'order-not-found' };
  return sendTicketForOrder(orderId, { skipConsentCheck, force: false, instant: false });
}

// Instant send function for admin resend operations - no retries, shorter timeout
async function sendTicketForBookingInstant(bookingId, skipConsentCheck = false) {
  if (!bookingId) return { success: false, reason: 'missing-bookingId' };
  const oRes = await pool.query(`SELECT order_id FROM bookings WHERE booking_id = $1`, [bookingId]);
  const orderId = oRes.rows[0]?.order_id || null;
  if (!orderId) return { success: false, reason: 'order-not-found' };
  return sendTicketForOrder(orderId, { skipConsentCheck, force: true, instant: true });
}

async function addContact({ phone, name, email, userId }) {
  if (!INTERAKT_KEY) {
    console.log('Interakt not configured - skipping contact add');
    return { success: false, reason: 'not-configured' };
  }
  if (!phone) return { success: false, reason: 'missing-phone' };

  if (userId) {
    const consentRes = await pool.query('SELECT whatsapp_consent FROM users WHERE user_id = $1', [userId]);
    const user = consentRes.rows[0];
    if (!user || !user.whatsapp_consent) {
      console.log('User has not consented to WhatsApp - skipping contact add');
      return { success: false, reason: 'no-consent' };
    }
  }

  const phoneNormalized = normalizePhone(phone);
  if (!phoneNormalized) return { success: false, reason: 'invalid-phone' };

  const contactPayload = {
    phoneNumber: phoneNormalized.phoneNumber,
    countryCode: phoneNormalized.countryCode,
    traits: {
      name: name || 'Guest',
      email: email || '',
      source: 'SnowCity Booking',
      whatsapp_opted_in: true
    },
    add_to_sales_cycle: true,
    createdAt: new Date().toISOString(),
    tags: ['snowcity-customer']
  };

  console.log('Interakt addContact payload:', JSON.stringify(contactPayload, null, 2));

  try {
    const INTERAKT_CONTACT_URL = 'https://api.interakt.ai/v1/public/track/users/';
    const opts = { headers: { Authorization: `Basic ${INTERAKT_KEY}`, 'Content-Type': 'application/json' }, timeout: 60000 };
    const res = await axiosPostWithRetries(INTERAKT_CONTACT_URL, contactPayload, opts, 3, 1000);
    console.log('Interakt contact added successfully:', res.data);
    return { success: true, response: res.data };
  } catch (err) {
    if (err?.response?.status === 409) return { success: true, reason: 'already-exists' };
    console.error('Interakt add contact error:', err?.response?.status, err?.response?.data || err?.message);
    return { success: false, reason: err?.response?.status || 'request-failed' };
  }
}

module.exports = {
  sendWhatsApp,
  sendTicketForOrder,
  buildTicketTemplateDataForOrder,
  sendTicketForBooking,
  sendTicketForBookingInstant,
  addContact
};
