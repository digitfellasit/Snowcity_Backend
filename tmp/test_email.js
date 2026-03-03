
const fs = require('fs');
const path = require('path');

// Mock render function similar to ticketEmailService.js
function renderTicketTemplate(tpl, vars = {}) {
    return tpl.replace(/\{\{(\w+)\}\}/g, (m, key) => (vars[key] !== undefined && vars[key] !== null ? vars[key] : ''));
}

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'ticket_email.html');
const tpl = fs.readFileSync(TEMPLATE_PATH, 'utf8');

const vars = {
    name: 'Vishal',
    order_ref: 'SCHQGRJC',
    order_date: '03 Mar 2026',
    items_html: '<div class="item-card"><div class="item-meta"><div class="item-title">Snow Park</div><div class="item-subinfo">03/03/2026 • 11:00 AM - 12:00 PM • Pax: 1</div></div><div class="item-amount">Rs. 650.00</div></div>',
    subtotal: 'Rs. 650.00',
    total: 'Rs. 650.00',
    payment_method: 'Online Payment',
    billing_name: 'Vishal',
    billing_phone: '+91 98406 20700',
    billing_email: 'vishal@example.com'
};

const rendered = renderTicketTemplate(tpl, vars);
fs.writeFileSync(path.join(__dirname, 'rendered_email.html'), rendered);
console.log('Rendered email saved to tmp/rendered_email.html');

// Basic checks
if (rendered.includes('Booking Id SCHQGRJC')) console.log('✅ Booking Id label OK');
if (!rendered.includes('Subtotal:')) console.log('✅ Subtotal removed OK');
if (rendered.includes('Billing Information')) console.log('✅ Billing Information label OK');
if (!rendered.includes('Booking ID:')) console.log('✅ Booking ID removed from items OK (based on mock items_html logic)');
