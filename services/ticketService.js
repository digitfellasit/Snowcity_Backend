'use strict';

const PDFDocument = require('pdfkit');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
dayjs.extend(utc);
const path = require('path');
const fs = require('fs');

const { pool } = require('../config/db');
const bookingsModel = require('../models/bookings.model');
const s3Service = require('./storage/s3Service');

// ---------- Configuration ----------
const ASSET_DIR = path.resolve(__dirname, '../utils');
const LOGO_PATH = path.join(ASSET_DIR, 'loading.png');       // Snow City logo
const BG_PATH   = path.join(ASSET_DIR, 'ticket', 'ticket-bg.jpg'); // Banner background

// ── Color Palette ──────────────────────────────────────────────────
const C = {
  navy:         '#030D1F',   // Deep navy (header bg, footer)
  bannerBlue:   '#0057B8',   // Primary blue banner
  accent:       '#FFB800',   // Golden yellow (highlights, "is" word)
  snowPark:     '#1565C0',
  madlabs:      '#7B1FA2',
  eyelusion:    '#00897B',
  defaultColor: '#1565C0',
  text:         '#1A1A2E',
  lightText:    '#555577',
  veryLight:    '#8888AA',
  white:        '#FFFFFF',
  offWhite:     '#F4F7FC',
  cardBg:       '#FFFFFF',
  cardBorder:   '#DDE3F0',
  infoBg:       '#EBF4FF',
  paidGreen:    '#1DB954',
  tagBg:        '#FFF3CD',
  tagText:      '#856404',
};

// ── Attraction color map ───────────────────────────────────────────
const ATTRACTION_COLORS = {
  'snow park':  C.snowPark,
  'snowpark':   C.snowPark,
  'madlabs':    C.madlabs,
  'mad labs':   C.madlabs,
  'eyelusion':  C.eyelusion,
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
const exists     = (p) => { try { return p && fs.existsSync(p); } catch { return false; } };
const money      = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN')}`;
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
  const end   = formatTime(row.slot_end_time);
  if (start && end) return `${start} – ${end}`;
  const legacyStart = formatTime(row.start_time);
  const legacyEnd   = formatTime(row.end_time);
  if (legacyStart && legacyEnd) return `${legacyStart} – ${legacyEnd}`;
  const bookingTime = formatTime(row.booking_time);
  if (bookingTime) return bookingTime;
  return row.slot_label || 'Open Entry';
}

// ── Pill / Badge helper ────────────────────────────────────────────
function drawPill(doc, x, y, text, bgColor, textColor, fontSize = 7.5) {
  const pad = 8;
  doc.save();
  doc.font('Helvetica').fontSize(fontSize);
  const tw = doc.widthOfString(text);
  const pillW = tw + pad * 2;
  const pillH = 14;
  doc.roundedRect(x, y, pillW, pillH, pillH / 2).fill(bgColor);
  doc.fillColor(textColor).text(text, x + pad, y + 3, { lineBreak: false });
  doc.restore();
  return pillW + 6; // return width + gap
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

  let guestName  = 'Guest';
  let guestPhone = '';
  let guestEmail = '';
  if (order.user_id) {
    try {
      const userRes = await pool.query(
        `SELECT name, phone, email FROM users WHERE user_id = $1`,
        [order.user_id]
      );
      if (userRes.rows.length) {
        guestName  = userRes.rows[0].name  || 'Guest';
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
        : (item.item_title || item.attraction_title || 'Entry Ticket'),
    }));

  return {
    orderId:        order.order_id,
    orderRef:       order.order_ref,
    totalAmount:    order.final_amount ?? order.total_amount,
    discountAmount: order.discount_amount || 0,
    couponCode:     order.coupon_code || null,
    orderDate:      order.created_at,
    guestName,
    guestPhone,
    guestEmail,
    items,
  };
}

// ── Drawing Logic ──────────────────────────────────────────────────
async function drawConsolidatedTicket(doc, data) {
  const { orderRef, items, totalAmount, guestName, guestPhone, orderDate } = data;

  const PW = doc.page.width;
  const PH = doc.page.height;
  const M  = 36; // side margins

  // ═══════════════════════════════════════════════════════════════
  // 1.  HEADER  –  White bar with logo left, booking-id right
  // ═══════════════════════════════════════════════════════════════
  const headerH = 88;

  doc.rect(0, 0, PW, headerH).fill(C.white);

  // Logo – left aligned, vertically centred
  if (exists(LOGO_PATH)) {
    const logoH = 52;
    doc.image(LOGO_PATH, M, (headerH - logoH) / 2, { height: logoH });
  }

  // Booking ID block – right
  const rightX  = PW - M;
  const labelY  = 22;
  doc.font('Helvetica').fontSize(7).fillColor(C.veryLight)
    .text('BOOKING ID', rightX - 175, labelY, { width: 175, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(20).fillColor(C.navy)
    .text(orderRef || '', rightX - 175, labelY + 11, { width: 175, align: 'right' });
  doc.font('Helvetica').fontSize(7.5).fillColor(C.lightText)
    .text(`Booking Placed On: ${dayjs.utc(orderDate).utcOffset(330).format('DD MMM YYYY hh:mma')}`, rightX - 175, labelY + 34, { width: 175, align: 'right' });

  // Thin bottom border on header
  doc.moveTo(0, headerH).lineTo(PW, headerH).strokeColor('#D0D8E8').lineWidth(1).stroke();

  // ═══════════════════════════════════════════════════════════════
  // 2.  BANNER  –  Full-width ticket-bg.jpg + overlay + headline
  // ═══════════════════════════════════════════════════════════════
  const bannerY = headerH;
  const bannerH = 130;

  // Fallback solid gradient if no image
  if (exists(BG_PATH)) {
    doc.image(BG_PATH, 0, bannerY, { width: PW, height: bannerH });
    // Dark blue tint overlay for legibility
    doc.save();
    doc.rect(0, bannerY, PW, bannerH).fill(C.bannerBlue);
    doc.opacity(0.55);
    doc.rect(0, bannerY, PW, bannerH).fill(C.navy);
    doc.restore();
  } else {
    // Gradient fallback
    const steps = 40;
    for (let i = 0; i < steps; i++) {
      const t  = i / steps;
      const r  = Math.round(0   + (0   - 0)   * t);
      const g  = Math.round(87  + (57  - 87)  * t);
      const b  = Math.round(184 + (184 - 184) * t);
      doc.rect(0, bannerY + (i * bannerH / steps), PW, bannerH / steps + 1)
         .fill(`rgb(${r},${g},${b})`);
    }
  }

  // Headline: "Your Booking " + [is] + " Confirmed!"
  // Center the whole line
  const headY    = bannerY + 28;
  const mainSize = 30;

  doc.save();
  // Measure parts for centering
  doc.font('Helvetica-Bold').fontSize(mainSize);
  const part1W = doc.widthOfString('Your Booking ');
  const partIsW = doc.widthOfString('is ');
  const part3W = doc.widthOfString('Confirmed!');
  const totalW = part1W + partIsW + part3W;
  const startX = (PW - totalW) / 2;

  doc.fillColor(C.white).text('Your Booking ', startX, headY, { lineBreak: false, continued: false });
  doc.fillColor(C.white).text('is ', startX + part1W, headY, { lineBreak: false, continued: false });
  doc.fillColor(C.accent).text('Confirmed!', startX + part1W + partIsW, headY, { lineBreak: false });
  doc.restore();

  // Scalloped bottom edge (white circles)
  doc.save();
  const scallop = 16;
  for (let x = scallop / 2; x < PW; x += scallop) {
    doc.circle(x, bannerY + bannerH, scallop / 2 + 1).fill(C.white);
  }
  doc.restore();

  // ═══════════════════════════════════════════════════════════════
  // 3.  SUMMARY LABEL + GUEST INFO  (white section)
  // ═══════════════════════════════════════════════════════════════
  let y = bannerY + bannerH + 18;

  doc.font('Helvetica').fontSize(9).fillColor(C.lightText)
    .text('Below is a summary of your booking', M, y);
  y += 18;

  // Two-col guest row
  doc.font('Helvetica').fontSize(7).fillColor(C.veryLight).text('GUEST NAME', M, y);
  if (guestPhone) doc.text('CONTACT', PW / 2, y);
  y += 11;

  doc.font('Helvetica-Bold').fontSize(13).fillColor(C.navy).text(guestName, M, y);
  if (guestPhone) {
    doc.font('Helvetica-Bold').fontSize(13).fillColor(C.navy).text(guestPhone, PW / 2, y);
  }
  y += 20;

  // Divider
  doc.moveTo(M, y).lineTo(PW - M, y).strokeColor(C.cardBorder).lineWidth(0.75).stroke();
  y += 20;

  // ═══════════════════════════════════════════════════════════════
  // 4.  ATTRACTION / BOOKING CARDS
  // ═══════════════════════════════════════════════════════════════
  items.forEach((item, idx) => {
    const title      = item.item_title || 'Booking';
    const color      = getAttractionColor(title);
    const slotStr    = getSlotDisplay(item);
    const dateStr    = dayjs(item.booking_date).format('dddd, D MMMM YYYY');
    const qty        = Number(item.quantity || 1);
    const hasAddons  = item.addons && item.addons.length > 0;
    const isSnowPark = (title || '').toLowerCase().includes('snow');

    // Estimate card height
    let cardH = 126;
    if (hasAddons) cardH += 14 + item.addons.length * 14;
    if (isSnowPark) cardH += 24; // extra row for tips pills

    if (y + cardH > PH - 150) { doc.addPage(); y = M; }

    const cardX = M;
    const cardW = PW - M * 2;

    // Card shadow (subtle)
    doc.save();
    doc.rect(cardX + 2, y + 2, cardW, cardH).fill('#E8ECF4');
    doc.restore();

    // Card background
    doc.roundedRect(cardX, y, cardW, cardH, 8).fill(C.cardBg);
    doc.roundedRect(cardX, y, cardW, cardH, 8)
       .strokeColor(C.cardBorder).lineWidth(0.75).stroke();

    // Left accent bar
    doc.roundedRect(cardX, y, 5, cardH, 3).fill(color);

    // ── Card header row ──────────────────────────────────────────
    const cx = cardX + 16;
    const cw = cardW - 20;

    doc.font('Helvetica-Bold').fontSize(12).fillColor(color)
      .text(title, cx, y + 12, { continued: false });

    // "Most Popular" badge for Snow Park
    if (isSnowPark) {
      drawPill(doc, cx + doc.widthOfString(title) + 10, y + 11,
               'Most Popular Experience', C.tagBg, C.tagText, 7);
    }

    // ── Three info columns ───────────────────────────────────────
    const infoY  = y + 34;
    const col1   = cx;
    const col2   = cx + 190;
    const col3   = cardX + cardW - 55;

    // Labels
    doc.font('Helvetica').fontSize(7).fillColor(C.veryLight);
    doc.text('VISIT DATE', col1, infoY);
    if (item.time_slot_enabled !== false) {
      doc.text('TIME SLOT', col2, infoY);
    }
    doc.text('QTY', col3, infoY);

    // Values
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.text);
    doc.text(dateStr, col1, infoY + 11);
    if (item.time_slot_enabled !== false) {
      doc.text(slotStr, col2, infoY + 11);
    }
    doc.font('Helvetica-Bold').fontSize(18).fillColor(C.navy)
      .text(String(qty), col3, infoY + 8);

    let nextY = infoY + 32;

    // ── Line-item price ─────────────────────────────────────────────
    const itemTotal = Number(item.final_amount || item.total_amount || 0);
    const unitPrice = qty > 0 ? Math.round(itemTotal / qty) : itemTotal;
    doc.font('Helvetica-Bold').fontSize(7).fillColor(C.veryLight)
      .text('TICKET PRICE', cx, nextY);
    nextY += 11;
    const ticketPriceStr = `${qty} × ${money(unitPrice)}`;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.paidGreen)
      .text(ticketPriceStr, cx, nextY);
    nextY += 16;

    // ── Offer details ─────────────────────────────────────────────
    if (item.offer && item.offer.title) {
      doc.font('Helvetica-Bold').fontSize(7).fillColor(C.veryLight)
        .text('OFFER', cx, nextY);
      nextY += 10;
      doc.font('Helvetica').fontSize(8.5).fillColor(C.text)
        .text(item.offer.title, cx, nextY, { width: cardW - 40 });
      nextY += 12;

      if (item.offer.rule_type === 'buy_x_get_y' && item.offer.buy_qty && item.offer.get_qty) {
        const offerLine = `Buy ${item.offer.buy_qty} Get ${item.offer.get_qty} (claim at counter)`;
        doc.font('Helvetica').fontSize(8).fillColor(C.lightText)
          .text(offerLine, cx, nextY, { width: cardW - 40 });
        nextY += 12;
      } else if (item.offer.discount_type && item.offer.discount_value) {
        const discountLabel = item.offer.discount_type === 'percent'
          ? `${item.offer.discount_value}% off`
          : `${money(item.offer.discount_value)} off`;
        doc.font('Helvetica').fontSize(8).fillColor(C.lightText)
          .text(discountLabel, cx, nextY, { width: cardW - 40 });
        nextY += 12;
      }
    }

    // ── Add-ons ──────────────────────────────────────────────────
    if (hasAddons) {
      doc.font('Helvetica-Bold').fontSize(7).fillColor(C.veryLight)
        .text('ADD-ONS', cx, nextY);
      nextY += 11;
      item.addons.forEach((addon) => {
        doc.font('Helvetica').fontSize(8.5).fillColor(C.text)
          .text(addon.title || 'Add-on', cx, nextY);
        const priceStr = `${addon.quantity} × ${money(addon.price)}`;
        doc.font('Helvetica-Bold').fontSize(8.5)
          .text(priceStr, cardX + cardW - 140, nextY, { width: 120, align: 'right' });
        nextY += 13;
      });
      nextY += 4;
    }

    // ── Snow Park tips pills ─────────────────────────────────────
    if (isSnowPark) {
      const pillY = nextY + 4;
      let px = cx;
      const pills = [
        { text: 'Arrive 15 mins early', bg: '#E8F5E9', fg: '#1B5E20' },
        { text: 'Jacket, Boots & Gloves FREE', bg: '#E3F2FD', fg: '#0D47A1' },
        { text: '45 mins snow access', bg: '#E8EAF6', fg: '#1A237E' },
      ];
      pills.forEach(p => {
        px += drawPill(doc, px, pillY, p.text, p.bg, p.fg, 7.5);
      });
      nextY = pillY + 18;
    }

    y += cardH + 16;
  });

  // ═══════════════════════════════════════════════════════════════
  // 5.  TOTAL AMOUNT PAID
  // ═══════════════════════════════════════════════════════════════
  const receiptH = 50;
  if (y + receiptH > PH - 100) { doc.addPage(); y = M; }

  const boxX = M;
  const boxW = PW - M * 2;

  // Box background & border
  doc.roundedRect(boxX, y, boxW, receiptH, 8).fill('#FFFBF0');
  doc.roundedRect(boxX, y, boxW, receiptH, 8)
     .strokeColor('#E8D5A0').lineWidth(0.75).stroke();

  const rx = boxX + 14;
  const rw = boxW - 28;

  doc.font('Helvetica-Bold').fontSize(8).fillColor(C.veryLight)
    .text('TOTAL PAID', rx, y + 10);
  doc.font('Helvetica-Bold').fontSize(20).fillColor(C.paidGreen)
    .text(money(totalAmount), rx, y + 22);

  y += receiptH + 16;
  
  // ═══════════════════════════════════════════════════════════════
  // 6.  KNOW BEFORE YOU GO
  // ═══════════════════════════════════════════════════════════════
  if (y > PH - 200) { doc.addPage(); y = M; }

  // Section box
  const kbygH = 130;
  doc.roundedRect(M, y, PW - M * 2, kbygH, 8).fill(C.infoBg);
  doc.roundedRect(M, y, PW - M * 2, kbygH, 8)
     .strokeColor('#BDD8F5').lineWidth(0.75).stroke();

  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.navy)
    .text('Know Before You Go', M + 14, y + 12);

  const tips = [
    'Socks are compulsory and available at additional cost.',
    'Jacket, boots & gloves are provided FREE — no need to bring your own.',
    'Arrive 15 minutes before your slot for gear fitting. Late arrivals get reduced time.',
    'Validate this ticket at the online counter of Snow Park',
    'No outside food or beverages inside the snow chamber. Snowman Cafe is on-site.',
    'Tickets are non-cancellable, non-refundable and non-transferable.',
    'Park timings subject to change. Check snowcityblr.com before your visit.',
  ];

  const half      = Math.ceil(tips.length / 2);
  const leftTips  = tips.slice(0, half);
  const rightTips = tips.slice(half);
  const tipW      = (PW - M * 2 - 40) / 2;
  let tipY = y + 28;

  leftTips.forEach((tip, i) => {
    doc.circle(M + 19, tipY + 4, 2).fill(C.bannerBlue);
    doc.font('Helvetica').fontSize(7.5).fillColor(C.text)
      .text(tip, M + 26, tipY, { width: tipW - 20 });
    tipY += doc.heightOfString(tip, { width: tipW - 20 }) + 6;
  });
  tipY = y + 28;
  rightTips.forEach((tip, i) => {
    const rx = M + 14 + tipW + 14;
    doc.circle(rx + 5, tipY + 4, 2).fill(C.bannerBlue);
    doc.font('Helvetica').fontSize(7.5).fillColor(C.text)
      .text(tip, rx + 12, tipY, { width: tipW - 20 });
    tipY += doc.heightOfString(tip, { width: tipW - 20 }) + 6;
  });

  y += kbygH + 20;

  // ═══════════════════════════════════════════════════════════════
  // 7.  FOOTER
  // ═══════════════════════════════════════════════════════════════
  const footerH = 68;
  const footerY = PH - footerH;
  doc.rect(0, footerY, PW, footerH).fill(C.navy);

   const footerCols = [
    { label: 'VISIT US',    lines: ['Fun World Complex,', 'Jayamahal Main Rd,', 'J.C.Nagar, Bengaluru – 560 006'] },
    { label: 'WEBSITE',     lines: ['www.snowcityblr.com'] },
    { label: 'CONTACT',     lines: ['+91 78295 50000', 'info@snowcityblr.com'] },
    { label: 'TIMINGS',     lines: ['10:00 AM – 8:00 PM', 'All days, year-round'] },
  ];

  const colW    = (PW - M * 2) / footerCols.length;
  const fStartX = M;

  footerCols.forEach((col, i) => {
    const fx = fStartX + i * colW;
    const fy = footerY + 10;
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(C.accent)
      .text(col.label, fx, fy);
    col.lines.forEach((line, li) => {
      doc.font('Helvetica').fontSize(7).fillColor('rgba(255,255,255,0.8)')
        .text(line, fx, fy + 10 + li * 10);
    });
  });

  // Fine print
  doc.save();
  doc.opacity(0.45).font('Helvetica').fontSize(5.5).fillColor(C.white)
    .text(
      'Official E-Ticket  |  Bengaluru Leisure Private Limited  |  Do not duplicate or alter  |  Valid only for booked date & slot',
      0, footerY + footerH - 10,
      { width: PW, align: 'center' }
    );
  doc.restore();
}

// ── Generate PDF Buffer (no disk storage) ──────────────────────────
async function generateTicketBuffer(booking_id) {
  const data = await getFullOrderData(booking_id);
  if (!data) throw new Error('Order/Booking not found');

  const doc = new PDFDocument({
    size:         'A4',
    margin:       0,
    autoFirstPage: true,
  });

  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));

  await drawConsolidatedTicket(doc, data);
  doc.end();

  const buffer = await new Promise((resolve, reject) => {
    doc.on('end',   () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  return {
    buffer,
    filename: `TICKET_${data.orderRef}.pdf`,
    orderRef: data.orderRef,
    orderId:  data.orderId,
  };
}

// ── Legacy alias: generateTicket uploads to S3 ─────────────────────
async function generateTicket(booking_id) {
  try {
    const result = await generateTicketBuffer(booking_id);

    const s3Result = await s3Service.uploadBuffer({
      buffer:      result.buffer,
      key:         `tickets/${result.filename}`,
      contentType: 'application/pdf',
    });

    console.log(`[TicketService] Ticket uploaded to S3: ${s3Result.location}`);
    return s3Result.location;
  } catch (err) {
    console.error('[TicketService] Failed to generate/upload ticket:', err);
    throw err;
  }
}

module.exports = { generateTicket, generateTicketBuffer, getFullOrderData };
