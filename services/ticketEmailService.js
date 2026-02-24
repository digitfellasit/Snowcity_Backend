const fs = require('fs');
const path = require('path');
const email = require('./emailService');
const bookingsModel = require('../models/bookings.model');
const usersModel = require('../models/users.model');
const ticketService = require('./ticketService');
const { APP_URL } = require('../config/messaging');

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'ticket_email.html');
let _ticketTemplate = null;
function loadTicketTemplate() {
  if (_ticketTemplate !== null) return _ticketTemplate;
  try {
    _ticketTemplate = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  } catch (e) {
    _ticketTemplate = null;
  }
  return _ticketTemplate;
}

function renderTicketTemplate(vars = {}) {
  const tpl = loadTicketTemplate();
  if (!tpl) {
    // Fallback minimal template (snow-blue theme)
    return `
      <div style="font-family:system-ui, -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#23395B">
        <div style="background:#EAF4FF;padding:18px;border-radius:6px;border:1px solid #D6EBFF">
          <h1 style="color:#0B4DA2;margin:0 0 6px">SnowCity</h1>
          <p style="margin:0 0 12px;color:#23527C">Hello ${vars.name || ''},</p>
          <p style="margin:0 0 12px">Your booking <strong>${vars.booking_ref || ''}</strong> is confirmed.</p>
          <div style="background:#fff;padding:12px;border-radius:4px;border:1px solid #EEF6FF">${vars.items_html || ''}</div>
          ${vars.download_link ? `<p style="margin-top:12px"><a href="${vars.download_link}" style="color:#0B66D2">Download ticket (PDF)</a></p>` : ''}
          <p style="margin-top:12px;color:#4A6B8A">Enjoy your visit — SnowCity Team</p>
        </div>
      </div>
    `;
  }

  return tpl.replace(/\{\{(\w+)\}\}/g, (m, key) => (vars[key] !== undefined && vars[key] !== null ? vars[key] : ''));
}

function absoluteFromUrlPath(urlPath) {
  if (!urlPath) return null;
  const rel = urlPath.replace(/^\/*/, '');
  return path.resolve(__dirname, '..', rel);
}

// Generate buffer for ticket instead of local disk read
async function getTicketBufferForBooking(booking_id) {
  try {
    const { buffer, filename } = await ticketService.generateTicketBuffer(booking_id);
    return { buffer, filename };
  } catch (err) {
    console.warn(`Failed to generate ticket buffer for booking ${booking_id}:`, err);
    return null;
  }
}

function formatMoney(n) {
  return `Rs. ${Number(n || 0).toFixed(2)}`;
}

function buildItemsHtml(items = []) {
  if (!items.length) return '<div class="no-items" style="text-align:center;color:#666;padding:12px;">No items found</div>';

  // Helper function to format time to 12-hour format
  function formatTime12Hour(time24) {
    if (!time24) return '';
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  }

  // Helper function to format date
  function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  }

  const rows = items.map((item) => {
    const title = item.item_title || (item.item_type === 'Combo' ? 'Combo Booking' : 'Attraction Ticket');

    // Debug logging
    console.log('🔍 DEBUG Email Service item:', {
      booking_id: item.booking_id,
      slot_start_time: item.slot_start_time,
      slot_end_time: item.slot_end_time,
      booking_time: item.booking_time,
      slot_label: item.slot_label
    });

    let slotTime;
    if (item.slot_start_time && item.slot_end_time) {
      slotTime = `${formatTime12Hour(item.slot_start_time)} - ${formatTime12Hour(item.slot_end_time)}`;
      console.log('🔍 DEBUG Email using formatted slot_start_time/end_time:', slotTime);
    } else if (item.booking_time) {
      slotTime = formatTime12Hour(item.booking_time);
      console.log('🔍 DEBUG Email using formatted booking_time:', slotTime);
    } else if (item.slot_label) {
      slotTime = item.slot_label;
      console.log('🔍 DEBUG Email using slot_label:', slotTime);
    } else {
      slotTime = 'Open Slot';
      console.log('🔍 DEBUG Email using fallback:', slotTime);
    }

    const bookingDate = formatDate(item.booking_date);
    const quantity = item.quantity || 1;
    const addons = item.addons || [];
    const addonsText = addons.length > 0
      ? addons.map(addon => `×${addon.quantity || 1} ${addon.title || 'Addon'}`).join(', ')
      : '-';

    return `
      <div class="item-card">
        <div class="item-meta">
          <div class="item-title">${title}</div>
          <div class="item-details">Booking ID: ${item.booking_id || item.booking_ref || '-'}</div>
          <div class="item-subinfo">${bookingDate} • ${slotTime} • Pax: ${quantity} • ${addonsText}</div>
        </div>
        <div class="item-amount">${formatMoney(item.final_amount || item.total_amount)}</div>
      </div>`;
  }).join('');

  return rows;
}

async function sendTicketEmail(booking_id) {
  const b = await bookingsModel.getBookingById(booking_id);
  if (!b) throw new Error('Booking not found');
  if (b.email_sent) return { sent: true, skipped: true };

  const user = b.user_id ? await usersModel.getUserById(b.user_id) : null;
  const to = user?.email || null;
  if (!to) return { sent: false, skipped: true, reason: 'No user email' };

  // Get order details for complete information
  const order = b.order_id ? await bookingsModel.getOrderWithDetails(b.order_id) : null;

  const subject = `Snow City Bangalore - Booking Confirmed!`;
  const text = `Hello${user?.name ? ' ' + user.name : ''},\n\nYour Snow City Bangalore booking has been confirmed.\nBooking Ref: ${b.booking_ref}\n\nEnjoy your visit!`;

  // Format order date
  const orderDate = order?.created_at ? new Date(order.created_at).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }) : new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  // Calculate totals
  const subtotal = order?.total_amount || b.final_amount || b.total_amount || 0;
  const total = subtotal; // Assuming no additional fees for now

  const html = renderTicketTemplate({
    name: user?.name || '',
    order_ref: b.booking_ref || b.booking_id,
    order_date: orderDate,
    items_html: buildItemsHtml([b]),
    subtotal: formatMoney(subtotal),
    total: formatMoney(total),
    payment_method: order?.payment_mode || b.payment_mode || 'Online Payment',
    billing_name: user?.name || '',
    billing_phone: user?.phone || '',
    billing_email: user?.email || '',
    download_link: b.ticket_pdf ? `${APP_URL}${b.ticket_pdf}` : ''
  });

  const attachments = [];
  const ticketData = await getTicketBufferForBooking(booking_id);
  if (ticketData && ticketData.buffer) {
    attachments.push({ filename: ticketData.filename || `ticket_${b.booking_ref}.pdf`, content: ticketData.buffer, contentType: 'application/pdf' });
  } else {
    console.warn('Could not generate PDF attachment for booking', booking_id);
  }

  await email.send({ to, subject, text, html, attachments });
  await bookingsModel.updateBooking(booking_id, { email_sent: true });
  return { sent: true };
}

async function sendOrderEmail(order_id) {
  const order = await bookingsModel.getOrderWithDetails(order_id);
  if (!order) throw new Error('Order not found');

  const user = order.user_id ? await usersModel.getUserById(order.user_id) : null;
  const to = user?.email || null;
  if (!to) return { sent: false, skipped: true, reason: 'No user email' };

  const greetingName = user?.name ? ` ${user.name}` : '';
  const subject = `Snow City Bangalore - Booking Confirmed!`;

  // Format order date
  const orderDate = order.created_at ? new Date(order.created_at).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }) : new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  // Calculate totals
  const subtotal = order.total_amount || 0;
  const total = order.final_amount || subtotal;

  const text = `Hello${greetingName},\n\nThank you for your purchase at Snow City Bangalore.\nOrder Ref: ${order.order_ref || order.order_id}\nTotal Paid: ${formatMoney(total)}\n\nYour ticket PDF is attached. Enjoy your visit!`;

  const html = renderTicketTemplate({
    name: user?.name || '',
    order_ref: order.order_ref || order.order_id,
    order_date: orderDate,
    items_html: buildItemsHtml(order.items || []),
    subtotal: formatMoney(subtotal),
    total: formatMoney(total),
    payment_method: order.payment_mode || 'Online Payment',
    billing_name: user?.name || '',
    billing_phone: user?.phone || '',
    billing_email: user?.email || '',
    download_link: (order.items && order.items[0] && order.items[0].ticket_pdf) ? `${APP_URL}${order.items[0].ticket_pdf}` : ''
  });

  const attachments = [];
  const pdfPaths = new Set();
  for (const item of order.items || []) {
    if (!item.ticket_pdf && !item.booking_id) continue;

    // Instead of reading the file path, simply fetch by booking ID
    const ticketData = await getTicketBufferForBooking(item.booking_id);
    if (ticketData && ticketData.buffer && !pdfPaths.has(item.booking_id)) {
      pdfPaths.add(item.booking_id);
      attachments.push({ filename: ticketData.filename || `ticket_${item.booking_ref}.pdf`, content: ticketData.buffer, contentType: 'application/pdf' });
    }
  }

  await email.send({ to, subject, text, html, attachments });
  return { sent: true, attachments: attachments.length };
}

module.exports = { sendTicketEmail, sendOrderEmail };
