require('dotenv').config();
const ticketEmailService = require('./services/ticketEmailService');
const interaktService = require('./services/interaktService');

const { pool } = require('./config/db');

async function testE2E() {
    const orderId = 277;
    console.log(`🚀 Starting E2E Notification Test for Order ID: ${orderId}`);

    try {
        // 1. Test Email Delivery
        console.log('--- Testing Email Delivery ---');
        const emailResult = await ticketEmailService.sendOrderEmail(orderId);
        console.log('Email Result:', JSON.stringify(emailResult, null, 2));

        // 2. Test WhatsApp Delivery
        console.log('\n--- Testing WhatsApp Delivery ---');
        const whatsappResult = await interaktService.sendTicketForOrder(orderId, { force: true });
        console.log('WhatsApp Result:', JSON.stringify(whatsappResult, null, 2));

    } catch (err) {
        console.error('💥 Test Error:', err);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

testE2E();
