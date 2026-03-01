'use strict';

const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const dayjs = require('dayjs');
const path = require('path');
const fs = require('fs');

const { pool } = require('../config/db');
const bookingsModel = require('../models/bookings.model');
const s3Service = require('./storage/s3Service');

// ---------- Configuration ----------
const ASSET_DIR = path.resolve(__dirname, '../utils');
const LOGO_PATH = path.join(ASSET_DIR, 'loading.png');  // Snowman mascot
const BG_PATH = path.join(ASSET_DIR, 'ticket', 'ticket-bg.png');

// ── Color Palette ──────────────────────────────────────────────────
const C = {
  bannerStart: '#0099FF',  // Deep blue gradient start
  bannerEnd: '#1A8FE3',  // Light blue gradient end
  footerBg: '#0099FF',  // Dark navy footer
  accent: '#F57C00',  // Orange for total
  snowPark: '#1565C0',  // Blue
  madlabs: '#7B1FA2',  // Purple
  eyelusion: '#00897B',  // Teal
  defaultColor: '#1565C0',  // Fallback blue
  text: '#222222',
  lightText: '#666666',
  veryLight: '#999999',
  white: '#FFFFFF',
  infoBg: '#E3F2FD',  // Light sky-blue info box background
  cardBorder: '#E0E0E0',
  pageBg: '#FFFFFF',
};

// ── Attraction color map ───────────────────────────────────────────
const ATTRACTION_COLORS = {
  'snow park': C.snowPark,
  'snowpark': C.snowPark,
  'madlabs': C.madlabs,
  'mad labs': C.madlabs,
  'eyelusion': C.eyelusion,
  'eye lusion': C.eyelusion,
};

function getAttractionColor(title) {
  const lower = (title || '').toLowerCase().trim();
  for (const [key, color] of Object.entries(ATTRACTION_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return C.defaultColor;
}

// ── Helpers ────────────────────────────────────────────────────────
const exists = (p) => { try { return p && fs.existsSync(p); } catch { return false; } };
const money = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN')}`;
const fmtDate = (d) => dayjs(d).format('ddd, D MMM YYYY');
const fmtDateShort = (d) => dayjs(d).format('DD MMM YYYY');

function formatTime(t) {
  if (!t) return '';
  const timeStr = String(t).split(' ')[0];
  const [h, m] = timeStr.split(':');
  if (!h || !m) return '';
  const hour = parseInt(h, 10);
  const minute = parseInt(m, 10);
  if (isNaN(hour) || isNaN(minute)) return '';
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${minute.toString().padStart(2, '0')} ${ampm}`;
}

function getSlotDisplay(row) {
  const start = formatTime(row.slot_start_time);
  const end = formatTime(row.slot_end_time);
  if (start && end) return `${start} – ${end}`;
  const legacyStart = formatTime(row.start_time);
  const legacyEnd = formatTime(row.end_time);
  if (legacyStart && legacyEnd) return `${legacyStart} – ${legacyEnd}`;
  const bookingTime = formatTime(row.booking_time);
  if (bookingTime) return bookingTime;
  return row.slot_label || 'Open Entry';
}

// ── Data Fetching (Order-Centric) ──────────────────────────────────

async function getFullOrderData(bookingId) {
  const orderRes = await pool.query(
    `SELECT order_id FROM bookings WHERE booking_id = $1`,
    [bookingId]
  );
  if (!orderRes.rows.length) return null;
  const orderId = orderRes.rows[0].order_id;

  const order = await bookingsModel.getOrderWithDetails(orderId);
  if (!order) return null;

  // Fetch guest info from users table
  let guestName = 'Guest';
  let guestPhone = '';
  let guestEmail = '';
  if (order.user_id) {
    try {
      const userRes = await pool.query(
        `SELECT name, phone, email FROM users WHERE user_id = $1`,
        [order.user_id]
      );
      if (userRes.rows.length) {
        guestName = userRes.rows[0].name || 'Guest';
        guestPhone = userRes.rows[0].phone || '';
        guestEmail = userRes.rows[0].email || '';
      }
    } catch (_) { /* silently continue */ }
  }

  const items = (order.items || [])
    .filter((item) => !item.parent_booking_id)
    .map((item) => ({
      ...item,
      item_title: item.item_type === 'Combo'
        ? (item.combo_title || item.combo_name || item.item_title || 'Combo Deal')
        : (item.item_title || item.attraction_title || 'Entry Ticket')
    }));

  return {
    orderId: order.order_id,
    orderRef: order.order_ref,
    totalAmount: order.final_amount ?? order.total_amount,
    discountAmount: order.discount_amount || 0,
    couponCode: order.coupon_code || null,
    orderDate: order.created_at,
    guestName,
    guestPhone,
    guestEmail,
    items,
  };
}

// ── Drawing Logic ──────────────────────────────────────────────────

async function drawConsolidatedTicket(doc, data) {
  const { orderRef, items, totalAmount, discountAmount, couponCode, guestName, guestPhone, guestEmail, orderDate } = data;
  const PW = doc.page.width;   // Page width
  const PH = doc.page.height;  // Page height
  const M = 40;                // Margins

  // ═══════════════════════════════════════════════════════════════
  // 1. HEADER BANNER (Blue gradient with logo)
  // ═══════════════════════════════════════════════════════════════
  const bannerH = 140;

  // Draw gradient by layering thin horizontal strips
  const gradSteps = 60;
  for (let i = 0; i < gradSteps; i++) {
    const ratio = i / gradSteps;
    const r1 = 11, g1 = 96, b1 = 176;    // #0B60B0
    const r2 = 26, g2 = 143, b2 = 227;   // #1A8FE3
    const r = Math.round(r1 + (r2 - r1) * ratio);
    const g = Math.round(g1 + (g2 - g1) * ratio);
    const b = Math.round(b1 + (b2 - b1) * ratio);
    const stripH = bannerH / gradSteps;
    doc.rect(0, i * stripH, PW, stripH + 1).fill(`rgb(${r}, ${g}, ${b})`);
  }

  // Draw background image if exists
  if (exists(BG_PATH)) {
    doc.image(BG_PATH, 0, 0, { width: PW, height: PH });
  }

  // Large watermark text "SNOW CITY" in faint white
  doc.save();
  doc.font('Helvetica-Bold').fontSize(64).fillColor(C.white).opacity(0.08)
    .text('SNOW CITY', 0, 45, { width: PW, align: 'center' });
  doc.restore();

  // Wavy snow bottom edge simulation
  doc.save();
  doc.rect(0, bannerH - 15, PW, 20).fill(C.pageBg);
  // Add slight curve illusion with overlapping circles
  for (let x = -10; x < PW + 20; x += 30) {
    doc.circle(x, bannerH - 10, 18).fill(C.pageBg);
  }
  doc.restore();

  // Logo (snowman mascot) – top left
  if (exists(LOGO_PATH)) {
    doc.image(LOGO_PATH, M, 12, { width: 70 });
  }

  // Booking ID & Order Date (top-right)
  const rightX = PW - M;
  doc.font('Helvetica').fontSize(8).fillColor(C.white).opacity(0.7)
    .text('BOOKING ID', rightX - 160, 25, { width: 160, align: 'right' });
  doc.opacity(1);
  doc.font('Helvetica-Bold').fontSize(16).fillColor(C.white)
    .text(orderRef || '', rightX - 160, 36, { width: 160, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor(C.white).opacity(0.7)
    .text(`Order Date: ${fmtDateShort(orderDate)}`, rightX - 160, 57, { width: 160, align: 'right' });
  doc.opacity(1);

  // ═══════════════════════════════════════════════════════════════
  // 2. GUEST INFORMATION SECTION
  // ═══════════════════════════════════════════════════════════════
  let y = bannerH + 10;

  doc.font('Helvetica-Bold').fontSize(12).fillColor(C.bannerStart)
    .text('Below is a summary of your booking', M, y);
  y += 22;

  // Guest Name & Contact
  doc.font('Helvetica').fontSize(10).fillColor(C.lightText)
    .text('Guest Name', M, y);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(C.text)
    .text(guestName, M + 100, y);
  y += 18;

  if (guestPhone) {
    doc.font('Helvetica').fontSize(10).fillColor(C.lightText)
      .text('Contact', M, y);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(C.text)
      .text(guestPhone, M + 100, y);
    y += 18;
  }

  // Thin separator line
  doc.moveTo(M, y + 2).lineTo(PW - M, y + 2).strokeColor(C.cardBorder).lineWidth(0.5).stroke();
  y += 14;

  // ═══════════════════════════════════════════════════════════════
  // 3. ATTRACTION / BOOKING CARDS (Color-coded)
  // ═══════════════════════════════════════════════════════════════
  items.forEach((item) => {
    const cardH = 95;

    // Check if we need a new page
    if (y + cardH > PH - 220) {
      doc.addPage();
      y = M;
    }

    const title = item.item_title || 'Booking';
    const color = getAttractionColor(title);
    const slotStr = getSlotDisplay(item);
    const dateStr = fmtDate(item.booking_date);
    const qty = Number(item.quantity || 1);
    const typeLabel = item.item_type === 'Combo' ? ' (Combo)' : '';

    // Left color bar
    doc.rect(M, y, 4, cardH).fill(color);

    // Card background
    doc.save();
    doc.rect(M + 4, y, PW - (M * 2) - 4, cardH).fill('#FAFAFA');
    doc.rect(M + 4, y, PW - (M * 2) - 4, cardH).strokeColor(C.cardBorder).lineWidth(0.5).stroke();
    doc.restore();

    // Attraction title header bar
    doc.rect(M + 4, y, PW - (M * 2) - 4, 26).fill(color);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(C.white)
      .text(`${title}${typeLabel}`, M + 14, y + 7);

    // Visit Date
    const infoY = y + 34;
    doc.font('Helvetica').fontSize(9).fillColor(C.lightText)
      .text('Visit Date', M + 14, infoY);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.text)
      .text(dateStr, M + 14, infoY + 13);

    // Time Slot
    const hasSlotTimes = item.slot_start_time || item.slot_end_time || item.start_time || item.end_time;
    if (hasSlotTimes) {
      doc.font('Helvetica').fontSize(9).fillColor(C.lightText)
        .text('Time Slot', M + 200, infoY);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(C.text)
        .text(slotStr, M + 200, infoY + 13);
    }

    // Quantity
    doc.font('Helvetica').fontSize(9).fillColor(C.lightText)
      .text('Qty', PW - M - 80, infoY);
    doc.font('Helvetica-Bold').fontSize(14).fillColor(color)
      .text(String(qty), PW - M - 80, infoY + 11);

    // Info box for Snow Park
    const lowerTitle = (title || '').toLowerCase();
    if (lowerTitle.includes('snow park') || lowerTitle.includes('snowpark')) {
      const infoBoxY = y + cardH;
      const infoBoxH = 22;
      doc.rect(M + 4, infoBoxY, PW - (M * 2) - 4, infoBoxH).fill(C.infoBg);
      doc.font('Helvetica').fontSize(7.5).fillColor('#1565C0')
        .text('■ Arrive 15 mins early for jacket, boots & gloves • 45 mins snow access', M + 14, infoBoxY + 6);
      y += infoBoxH;
    }

    y += cardH + 10;
  });

  // ═══════════════════════════════════════════════════════════════
  // 4. QR CODE
  // ═══════════════════════════════════════════════════════════════
  try {
    const qrBuffer = await QRCode.toBuffer(orderRef || 'SNOWCITY', {
      margin: 1,
      width: 100,
      color: { dark: '#0B60B0', light: '#FFFFFF' }
    });
    // Position it in the bottom-right of the banner
    doc.image(qrBuffer, PW - M - 70, bannerH - 85, { width: 70 });

    doc.font('Helvetica').fontSize(6).fillColor(C.white).opacity(0.8)
      .text('SCAN TO VERIFY', PW - M - 70, bannerH - 15, { width: 70, align: 'center' });
    doc.opacity(1);
  } catch (err) {
    console.warn('[TicketService] QR Code generation failed:', err);
  }


  // ═══════════════════════════════════════════════════════════════
  // 5. TOTAL AMOUNT
  // ═══════════════════════════════════════════════════════════════
  y += 8;

  if (discountAmount && Number(discountAmount) > 0) {
    doc.font('Helvetica').fontSize(9).fillColor(C.lightText)
      .text(`Discount: -${money(discountAmount)}`, M, y);
    if (couponCode) {
      doc.text(`  (Coupon: ${couponCode})`, M + 130, y);
    }
    y += 16;
  }

  doc.font('Helvetica-Bold').fontSize(18).fillColor(C.accent)
    .text(`Total Amount: ${money(totalAmount)}`, M, y);
  y += 30;

  // ═══════════════════════════════════════════════════════════════
  // 6. TERMS & CONDITIONS
  // ═══════════════════════════════════════════════════════════════
  // Check if we need a new page for terms
  if (y > PH - 230) {
    doc.addPage();
    y = M;
  }

  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.text)
    .text('Terms and Conditions', M, y);
  y += 16;

  const terms = [
    'This ticket is valid only for the date and time slot mentioned above.',
    'Please arrive at least 15 minutes before your scheduled time slot.',
    'Late arrivals may result in reduced activity time; no extensions will be provided.',
    'Tickets are non-transferable and non-refundable once purchased.',
    'Management reserves the right to refuse entry in case of misconduct.',
    'Children below 3 years enter free. Children aged 3–12 require a child ticket.',
    'Photography/videography is subject to park rules and restrictions.',
    'Snow City is not responsible for loss of personal belongings.',
    'By entering the premises, you agree to follow all safety guidelines.',
  ];

  terms.forEach((term, idx) => {
    doc.font('Helvetica').fontSize(7.5).fillColor(C.lightText)
      .text(`${idx + 1}. ${term}`, M, y, { width: PW - (M * 2) });
    y += 12;
  });

  // ═══════════════════════════════════════════════════════════════
  // 7. FOOTER (Dark blue bar)
  // ═══════════════════════════════════════════════════════════════
  const footerH = 50;
  const footerY = PH - footerH;

  doc.rect(0, footerY, PW, footerH).fill(C.footerBg);

  const colW = (PW - M * 2) / 3;

  // Column 1: Visit Us
  doc.font('Helvetica-Bold').fontSize(7).fillColor(C.white)
    .text('VISIT US', M, footerY + 10);
  doc.font('Helvetica').fontSize(6.5).fillColor(C.white).opacity(0.8)
    .text('fun world complex, Jayamahal Main Rd, Bengaluru', M, footerY + 21);
  doc.text('Karnataka 560006', M, footerY + 30);
  doc.opacity(1);

  // Column 2: Website / Park Timings
  doc.font('Helvetica-Bold').fontSize(7).fillColor(C.white)
    .text('WEBSITE / PARK TIMINGS', M + colW, footerY + 10);
  doc.font('Helvetica').fontSize(6.5).fillColor(C.white).opacity(0.8)
    .text('www.snowcityblr.com', M + colW, footerY + 21);
  doc.text('10:00 AM – 8:00 PM', M + colW, footerY + 30);
  doc.opacity(1);

  // Column 3: Contact Us
  doc.font('Helvetica-Bold').fontSize(7).fillColor(C.white)
    .text('CONTACT US', M + colW * 2, footerY + 10);
  doc.font('Helvetica').fontSize(6.5).fillColor(C.white).opacity(0.8)
    .text('+91 7829550000', M + colW * 2, footerY + 21);
  doc.text('info@snowcityblr.com', M + colW * 2, footerY + 30);
  doc.opacity(1);

  // Disclaimer at very bottom
  doc.font('Helvetica').fontSize(6).fillColor(C.veryLight)
    .text(
      'Official E-Ticket | Bengaluru Leisure Private Limited | Do not duplicate or alter',
      0, footerY + footerH + 4,
      { width: PW, align: 'center' }
    );
}

// ── Generate PDF Buffer (no disk storage) ──────────────────────────

async function generateTicketBuffer(booking_id) {
  const data = await getFullOrderData(booking_id);
  if (!data) throw new Error('Order/Booking not found');

  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    autoFirstPage: true,
  });

  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));

  await drawConsolidatedTicket(doc, data);
  doc.end();

  const buffer = await new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  return {
    buffer,
    filename: `ORDER_${data.orderRef}.pdf`,
    orderRef: data.orderRef,
    orderId: data.orderId,
  };
}

// ── Legacy alias: generateTicket uploads to S3 ─────────────────────

async function generateTicket(booking_id) {
  try {
    const result = await generateTicketBuffer(booking_id);

    const s3Result = await s3Service.uploadBuffer({
      buffer: result.buffer,
      key: `tickets/${result.filename}`,
      contentType: 'application/pdf'
    });

    console.log(`[TicketService] Ticket uploaded to S3: ${s3Result.location}`);
    return s3Result.location;
  } catch (err) {
    console.error('[TicketService] Failed to generate/upload ticket:', err);
    const data = await getFullOrderData(booking_id);
    if (data) {
      return `/api/tickets/generated/ORDER_${data.orderRef}.pdf`;
    }
    throw err;
  }
}

module.exports = { generateTicket, generateTicketBuffer, getFullOrderData };