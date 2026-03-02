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
  const { orderRef, items, totalAmount, discountAmount, couponCode, guestName, guestPhone, orderDate } = data;
  const PW = doc.page.width;   // Page width
  const PH = doc.page.height;  // Page height
  const M = 40;                // Margins

  // ═══════════════════════════════════════════════════════════════
  // 1. WHITE HEADER SECTION
  // ═══════════════════════════════════════════════════════════════
  const headerH = 70;
  doc.rect(0, 0, PW, headerH).fill(C.white);

  // Logo (snowman mascot) – top left
  if (exists(LOGO_PATH)) {
    doc.image(LOGO_PATH, M, 12, { width: 70 });
  }

  // Booking ID & Order Date (top-right)
  const rightX = PW - M;
  const darkBlue = '#044DCE';

  doc.font('Helvetica').fontSize(7).fillColor(C.veryLight)
    .text('BOOKING ID', rightX - 160, 20, { width: 160, align: 'right' });

  doc.font('Helvetica-Bold').fontSize(16).fillColor(darkBlue)
    .text(orderRef || '', rightX - 160, 30, { width: 160, align: 'right' });

  doc.font('Helvetica').fontSize(8).fillColor(C.lightText)
    .text(`Order Date: ${fmtDateShort(orderDate)}`, rightX - 160, 50, { width: 160, align: 'right' });

  // ═══════════════════════════════════════════════════════════════
  // 2. BLUE BANNER SECTION
  // ═══════════════════════════════════════════════════════════════
  const bannerY = headerH;
  const bannerH = 120;

  // Draw gradient banner - exactly as per screenshot (vibrant blue to pale blue)
  const gradSteps = 40;
  for (let i = 0; i < gradSteps; i++) {
    const ratio = i / gradSteps;
    const r1 = 0, g1 = 153, b1 = 255;    // Vibrant blue
    const r2 = 227, g2 = 242, b2 = 253;  // Pale blue
    const r = Math.round(r1 + (r2 - r1) * ratio);
    const g = Math.round(g1 + (g2 - g1) * ratio);
    const b = Math.round(b1 + (b2 - b1) * ratio);
    const stripH = bannerH / gradSteps;
    doc.rect(0, bannerY + i * stripH, PW, stripH + 1).fill(`rgb(${r}, ${g}, ${b})`);
  }

  // Restore background image (snowflakes)
  if (exists(BG_PATH)) {
    doc.save();
    doc.opacity(0.6); // Subtle overlay
    doc.image(BG_PATH, 0, bannerY, { width: PW, height: bannerH });
    doc.restore();
  }

  // Large watermark text "SNOW CITY" in faint white
  doc.save();
  doc.font('Helvetica-Bold').fontSize(64).fillColor(C.white).opacity(0.12)
    .text('SNOW CITY', 0, bannerY + 35, { width: PW, align: 'center' });
  doc.restore();

  // Wavy snow bottom simulation
  doc.save();
  doc.rect(0, bannerY + bannerH - 8, PW, 15).fill(C.pageBg);
  for (let x = -10; x < PW + 20; x += 30) {
    doc.circle(x, bannerY + bannerH - 5, 18).fill(C.pageBg);
  }
  doc.restore();

  // ═══════════════════════════════════════════════════════════════
  // 3. GUEST INFORMATION SECTION (Side-by-side)
  // ═══════════════════════════════════════════════════════════════
  let y = bannerY + bannerH + 15;

  doc.font('Helvetica-Bold').fontSize(12).fillColor(darkBlue)
    .text('Below is a summary of your booking', M, y);
  y += 25;

  // Header Labels
  doc.font('Helvetica').fontSize(8).fillColor(C.veryLight)
    .text('GUEST NAME', M, y);
  doc.text('CONTACT', M + 240, y);
  y += 12;

  // Values
  doc.font('Helvetica-Bold').fontSize(11).fillColor(C.text)
    .text(guestName, M, y);
  if (guestPhone) {
    doc.text(guestPhone, M + 240, y);
  }
  y += 20;

  // Separator
  doc.moveTo(M, y).lineTo(PW - M, y).strokeColor(C.cardBorder).lineWidth(0.5).stroke();
  y += 15;

  // ═══════════════════════════════════════════════════════════════
  // 4. ATTRACTION / BOOKING CARDS
  // ═══════════════════════════════════════════════════════════════
  items.forEach((item) => {
    const title = item.item_title || 'Booking';
    const hasAddons = item.addons && item.addons.length > 0;
    const isSnowPark = (title || '').toLowerCase().includes('snow park');

    let cardH = 85;
    if (hasAddons) cardH += 15 + (item.addons.length * 12);
    if (isSnowPark) cardH += 25;

    if (y + cardH > PH - 140) {
      doc.addPage();
      y = M;
    }

    const color = getAttractionColor(title);
    const slotStr = getSlotDisplay(item);
    const dateStr = dayjs(item.booking_date).format('dddd, D MMMM YYYY');
    const qty = Number(item.quantity || 1);

    // Colored top border (horizontal line)
    doc.moveTo(M, y).lineTo(PW - M, y).strokeColor(color).lineWidth(4).stroke();

    // Card background/border
    doc.save();
    doc.rect(M, y + 2, PW - (M * 2), cardH - 2).fill(C.white);
    doc.rect(M, y + 2, PW - (M * 2), cardH - 2).strokeColor(C.cardBorder).lineWidth(0.5).stroke();
    doc.restore();

    // Content
    doc.font('Helvetica-Bold').fontSize(11).fillColor(darkBlue)
      .text(title, M + 14, y + 12);

    const infoY = y + 32;
    // Labels
    doc.font('Helvetica').fontSize(8).fillColor(C.veryLight)
      .text('VISIT DATE', M + 14, infoY);
    doc.text('TIME SLOT', M + 240, infoY);
    doc.text('QTY', PW - M - 60, infoY);

    // Data
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.text)
      .text(dateStr, M + 14, infoY + 12);
    doc.text(slotStr, M + 240, infoY + 12);
    doc.fontSize(14).fillColor(C.text)
      .text(String(qty), PW - M - 60, infoY + 10);

    let nextY = infoY + 28;

    // Add-ons Section
    if (hasAddons) {
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.veryLight)
        .text('ADD-ONS', M + 14, nextY);
      nextY += 12;

      item.addons.forEach((addon) => {
        doc.font('Helvetica').fontSize(8.5).fillColor(C.text)
          .text(addon.title || 'Add-on', M + 14, nextY);

        const priceStr = `${addon.quantity} x ${money(addon.price)}`;
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.text)
          .text(priceStr, PW - M - 140, nextY, { width: 120, align: 'right' });

        nextY += 12;
      });
      nextY += 5;
    }

    // Snow Park Specific Note
    if (isSnowPark) {
      const boxY = y + cardH - 25;
      doc.roundedRect(M + 14, boxY, 300, 18, 4).fill('#E3F2FD');
      doc.font('Helvetica').fontSize(7.5).fillColor('#1565C0')
        .text('■ Arrive 15 mins early for jacket, boots & gloves • 45 mins snow access', M + 20, boxY + 6);
    }

    y += cardH + 15;
  });

  // ═══════════════════════════════════════════════════════════════
  // 5. TOTAL AMOUNT SECTION
  // ═══════════════════════════════════════════════════════════════
  doc.moveTo(M, y).lineTo(PW - M, y).strokeColor(C.cardBorder).lineWidth(0.5).stroke();
  y += 15;

  if (y > PH - 100) { doc.addPage(); y = M; }

  doc.font('Helvetica').fontSize(8).fillColor(C.veryLight)
    .text('TOTAL AMOUNT PAID', M, y);

  const totalY = y + 12;
  doc.font('Helvetica-Bold').fontSize(22).fillColor('#D8973C')
    .text(money(totalAmount), M, totalY);

  doc.font('Helvetica').fontSize(8).fillColor(C.lightText)
    .text('This is your official payment confirmation.', PW - M - 200, totalY, { width: 200, align: 'right' });
  doc.text('No separate invoice will be issued.', PW - M - 200, totalY + 10, { width: 200, align: 'right' });

  y += 50;

  // ═══════════════════════════════════════════════════════════════
  // 6. TERMS & CONDITIONS
  // ═══════════════════════════════════════════════════════════════
  if (y > PH - 180) { doc.addPage(); y = M; }

  doc.font('Helvetica-Bold').fontSize(10).fillColor(darkBlue)
    .text('Terms and Conditions', M, y);
  y += 18;

  const terms = [
    'Tickets are valid only for the respective booked dates and time slots shown above.',
    'For Snow Park: arrive 15 minutes before your slot for jacket, boots & gloves fitting.',
    'Snow Park access is 45 minutes. Late arrivals will have reduced time inside.',
    'This e-ticket must be presented (digital or printed) at the entrance gate.',
    'Tickets are non-cancellable, non-refundable and non-transferable.',
    'No outside food or beverages permitted inside the snow chamber.',
    'Snowman Cafe is available on-site for refreshments.',
    'Management reserves the right to refuse entry on safety or operational grounds.',
    'Park timings are subject to change. Please check snowcityblr.com before your visit.'
  ];

  terms.forEach((term) => {
    doc.circle(M + 5, y + 3, 1).fill(C.lightText);
    doc.font('Helvetica').fontSize(7.5).fillColor(C.lightText)
      .text(term, M + 15, y, { width: PW - M * 2 - 15 });
    y += 12;
  });

  // ═══════════════════════════════════════════════════════════════
  // 7. FOOTER SECTION
  // ═══════════════════════════════════════════════════════════════
  const footerH = 60;
  const footerY = PH - footerH;
  doc.rect(0, footerY, PW, footerH).fill(darkBlue);

  const colW = (PW - M * 2) / 3;
  const footerTextY = footerY + 12;

  doc.font('Helvetica-Bold').fontSize(7).fillColor(C.white);
  doc.text('VISIT US', M, footerTextY);
  doc.text('WEBSITE', M + colW, footerTextY);
  doc.text('CONTACT US', M + colW * 2, footerTextY);

  doc.font('Helvetica').fontSize(6.5).opacity(0.8);
  doc.text('Fun World Complex, Jayamahal Main Rd,', M, footerTextY + 11);
  doc.text('J.C.Nagar, Bengaluru – 560 006', M, footerTextY + 20);

  doc.text('www.snowcityblr.com', M + colW, footerTextY + 11);
  doc.font('Helvetica-Bold').text('PARK TIMINGS', M + colW, footerTextY + 20);
  doc.font('Helvetica').text('10:00 AM – 8:00 PM (All days)', M + colW, footerTextY + 29);

  doc.text('+91 78295 50000', M + colW * 2, footerTextY + 11);
  doc.text('info@snowcityblr.com', M + colW * 2, footerTextY + 20);

  doc.opacity(0.4).fontSize(6).text('Official E-Ticket | Bengaluru Leisure Private Limited | Do not duplicate or alter', 0, footerY + footerH - 10, { width: PW, align: 'center' });
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
    throw err;
  }
}

module.exports = { generateTicket, generateTicketBuffer, getFullOrderData };