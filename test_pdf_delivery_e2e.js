require('dotenv').config();
const { sendTicketForBookingInstant } = require('./services/interaktService');

async function runTest() {
    const bookingId = 361; // Valid booking found in DB
    console.log(`🚀 Starting end-to-end WhatsApp PDF test for Booking ID: ${bookingId}`);

    try {
        const result = await sendTicketForBookingInstant(bookingId, true);

        if (result.success) {
            console.log('✅ SUCCESS: WhatsApp payload sent to Interakt.');
            console.log('Interakt Response:', JSON.stringify(result.response, null, 2));
            console.log('\nCheck the recipient phone for the PDF document.');
        } else {
            console.error('❌ FAILED:', result.reason);
            if (result.response) {
                console.error('Interakt Error Response:', JSON.stringify(result.response, null, 2));
            }
        }
    } catch (error) {
        console.error('💥 CRITICAL ERROR during test:', error.message);
        console.error(error.stack);
    } finally {
        process.exit(0);
    }
}

runTest();
