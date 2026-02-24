'use strict';

const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const dayjs = require('dayjs');
const path = require('path');
const fs = require('fs');

const { pool } = require('../config/db');
const bookingsModel = require('../models/bookings.model');

// ---------- Configuration ----------
const ASSET_DIR = path.resolve(__dirname, '../utils');
const TICKET_BG = path.join(ASSET_DIR, 'ticket/ticket-bg.png');
const LOGO_PATH = path.join(ASSET_DIR, 'logo.png');

// Wonderla-style vibrant colors
const COLORS = {
  primary: '#0056D2',    // Deep Blue
  secondary: '#00A8E8',  // Cyan
  accent: '#FFC107',     // Amber/Yellow
  text: '#333333',
  lightText: '#666666',
  white: '#FFFFFF',
  border: '#DDDDDD'
};

// Helpers
const exists = (p) => { try { return p && fs.existsSync(p); } catch { return false; } };
const money = (n) => `Rs. ${Number(n || 0).toFixed(2)}`;
const fmtDate = (d) => dayjs(d).format('DD MMM, YYYY');

// Helper: Format time '14:30:00' -> '2:30 PM'
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

// Helper: Get Slot String
function getSlotDisplay(row) {
  const start = formatTime(row.slot_start_time);
  const end = formatTime(row.slot_end_time);
  if (start && end) return `${start} - ${end}`;

  const legacyStart = formatTime(row.start_time);
  const legacyEnd = formatTime(row.end_time);
  if (legacyStart && legacyEnd) return `${legacyStart} - ${legacyEnd}`;

  const bookingTime = formatTime(row.booking_time);
  if (bookingTime) return bookingTime;

  return row.slot_label || 'Open Entry';
}

// ---------- Data Fetching (Order-Centric) ----------

async function getFullOrderData(bookingId) {
  // 1. Find the Order ID for this booking
  const orderRes = await pool.query(
    `SELECT order_id FROM bookings WHERE booking_id = $1`,
    [bookingId]
  );

  if (!orderRes.rows.length) return null;
  const orderId = orderRes.rows[0].order_id;

  // 2. Use canonical model helper
  const order = await bookingsModel.getOrderWithDetails(orderId);
  if (!order) return null;

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
    items
  };
}

// ---------- Drawing Logic ----------

async function drawConsolidatedTicket(doc, data) {
  const { orderRef, items, totalAmount, discountAmount, couponCode } = data;
  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const margin = 20;

  // 1. Background / Branding
  if (exists(TICKET_BG)) {
    doc.image(TICKET_BG, 0, 0, { width: pageWidth, height: pageHeight });
  } else {
    doc.rect(0, 0, pageWidth, 90).fill(COLORS.primary);
    doc.rect(0, pageHeight - 40, pageWidth, 40).fill(COLORS.secondary);
  }

  // Logo
  if (exists(LOGO_PATH)) {
    doc.image(LOGO_PATH, margin + 10, 15, { width: 80 });
  } else {
    doc.font('Helvetica-Bold').fontSize(24).fillColor(COLORS.white)
      .text('SNOW CITY', margin + 20, 35);
  }

  // Header Info
  doc.font('Helvetica-Bold').fontSize(14).fillColor(COLORS.white)
    .text('ORDER RECEIPT & E-TICKET', 0, 25, { align: 'right', width: pageWidth - margin });

  doc.font('Helvetica').fontSize(10).fillColor('#E0E0E0')
    .text(`Ref: ${orderRef}`, 0, 45, { align: 'right', width: pageWidth - margin });

  // 2. Item List Container
  let yPos = 110;

  doc.fillColor(COLORS.text);
  doc.font('Helvetica-Bold').fontSize(14).text('YOUR BOOKINGS', margin + 10, yPos);
  doc.rect(margin + 10, yPos + 18, pageWidth - (margin * 2) - 20, 2).fill(COLORS.accent);

  yPos += 35;

  // 3. Iterate Items
  doc.font('Helvetica').fontSize(10);

  items.forEach((item, index) => {
    if (yPos > pageHeight - 150) {
      doc.addPage();
      yPos = 50;
    }

    const slotStr = getSlotDisplay(item);
    const dateStr = fmtDate(item.booking_date);
    const itemTitle = item.item_title.toUpperCase();
    const typeLabel = item.item_type === 'Combo' ? ' [COMBO PACKAGE]' : '';

    let itemHeight = 55;
    if (item.addons && item.addons.length > 0) {
      itemHeight += item.addons.length * 12 + 10;
    }
    if (item.offer) {
      itemHeight += 25;
    }

    // Item Box Background
    doc.save();
    doc.roundedRect(margin + 10, yPos, pageWidth - (margin * 2) - 150, itemHeight, 5)
      .fillAndStroke('#F9F9F9', '#EEEEEE');
    doc.restore();

    // Item Text
    doc.fillColor(COLORS.primary).font('Helvetica-Bold').fontSize(12)
      .text(`${index + 1}. ${itemTitle}${typeLabel}`, margin + 20, yPos + 10);

    doc.fillColor(COLORS.lightText).font('Helvetica').fontSize(10)
      .text(`Date: ${dateStr}   |   Slot: ${slotStr}`, margin + 20, yPos + 30);

    let currentY = yPos + 45;

    // Show addons if present
    if (item.addons && item.addons.length > 0) {
      doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(9)
        .text('Add-ons:', margin + 20, currentY);
      currentY += 12;

      item.addons.forEach((addon) => {
        const addonText = `• ${addon.title} x${addon.quantity} (${money(addon.price * addon.quantity)})`;
        doc.fillColor(COLORS.lightText).font('Helvetica').fontSize(8)
          .text(addonText, margin + 25, currentY);
        currentY += 10;
      });
      currentY += 5;
    }

    // Show offer details if present
    if (item.offer) {
      doc.fillColor(COLORS.secondary).font('Helvetica-Bold').fontSize(9)
        .text(`Offer: ${item.offer.title}`, margin + 20, currentY);
      currentY += 12;

      let offerText = '';
      if (item.offer.rule_type === 'buy_x_get_y' && item.offer.buy_qty && item.offer.get_qty) {
        offerText = `Buy ${item.offer.buy_qty} Get ${item.offer.get_qty}`;
        if (item.offer.get_discount_type === 'percent' && item.offer.get_discount_value) {
          offerText += ` (${item.offer.get_discount_value}% off)`;
        } else if (item.offer.get_discount_type === 'amount' && item.offer.get_discount_value) {
          offerText += ` (${money(item.offer.get_discount_value)} off)`;
        } else {
          offerText += ' Free';
        }
      } else if (item.offer.discount_type === 'percent') {
        offerText = `${item.offer.discount_percent}% discount`;
      } else if (item.offer.discount_type === 'amount') {
        offerText = `${money(item.offer.discount_value)} off`;
      }

      if (offerText) {
        doc.fillColor(COLORS.lightText).font('Helvetica').fontSize(8)
          .text(offerText, margin + 25, currentY);
      }
    }

    // Qty Badge
    doc.save();
    doc.circle(pageWidth - 180, yPos + 27, 18).fill(COLORS.accent);
    doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(10)
      .text(item.quantity, pageWidth - 195, yPos + 22, { width: 30, align: 'center' });
    doc.fontSize(7).text('PAX', pageWidth - 195, yPos + 33, { width: 30, align: 'center' });
    doc.restore();

    yPos += itemHeight + 10;
  });

  // 4. QR Code Area (Right Side)
  const qrSize = 110;
  const qrX = pageWidth - margin - qrSize - 10;
  const qrY = 110;

  doc.save();
  doc.roundedRect(qrX - 5, qrY - 5, qrSize + 10, qrSize + 30, 5).strokeColor(COLORS.border).stroke();
  doc.restore();

  try {
    const qrString = JSON.stringify({ type: 'ORDER', ref: orderRef, count: items.length });
    const qrBuf = Buffer.from(
      (await QRCode.toDataURL(qrString, { margin: 0, width: qrSize, color: { dark: COLORS.primary } })).split(',')[1],
      'base64'
    );
    doc.image(qrBuf, qrX, qrY, { width: qrSize, height: qrSize });
  } catch (e) { }

  doc.fontSize(8).fillColor(COLORS.lightText)
    .text('Scan for Entry', qrX, qrY + qrSize + 5, { width: qrSize, align: 'center' });

  // 5. Totals & Footer
  const bottomY = pageHeight - 80;

  // Show discount if any
  if (discountAmount && Number(discountAmount) > 0) {
    doc.font('Helvetica').fontSize(10).fillColor(COLORS.lightText)
      .text(`Discount: -${money(discountAmount)}`, margin + 20, bottomY - 35);
    if (couponCode) {
      doc.text(`Coupon: ${couponCode}`, margin + 250, bottomY - 35);
    }
  }

  doc.font('Helvetica-Bold').fontSize(16).fillColor(COLORS.primary)
    .text(`TOTAL PAID: ${money(totalAmount)}`, margin + 20, bottomY - 20);

  doc.fontSize(8).fillColor('#888')
    .text('Non-refundable. Valid only for the date/slot specified.', margin + 20, bottomY + 10);
  doc.text('www.snowcity.com | +91-9876543210', margin + 20, bottomY + 22);
}

// ---------- Generate PDF Buffer (no disk storage) ----------

async function generateTicketBuffer(booking_id) {
  const data = await getFullOrderData(booking_id);
  if (!data) throw new Error('Order/Booking not found');

  const doc = new PDFDocument({
    size: [650, 400],
    margin: 0,
    autoFirstPage: true
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

// Legacy alias: generateTicket now returns buffer info instead of file path
async function generateTicket(booking_id) {
  const result = await generateTicketBuffer(booking_id);
  // Return a virtual path for backward compatibility (no actual file stored)
  return `/tickets/generated/${result.filename}`;
}

module.exports = { generateTicket, generateTicketBuffer, getFullOrderData };