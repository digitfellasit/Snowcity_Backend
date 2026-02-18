require('dotenv').config();
const bookingService = require('./services/bookingService');
const { pool } = require('./config/db');

async function test() {
    try {
        console.log('Starting verification test...');

        // 1. Get a valid attraction
        const attractionRes = await pool.query('SELECT attraction_id, base_price, title FROM attractions WHERE active = true LIMIT 1');
        if (!attractionRes.rows.length) throw new Error('No active attractions found');
        const attraction = attractionRes.rows[0];
        console.log('Using attraction:', { id: attraction.attraction_id, title: attraction.title, base: attraction.base_price });

        // 2. Get a slot (optional but good for realism)
        const slotRes = await pool.query('SELECT slot_id, start_time FROM attraction_slots WHERE attraction_id = $1 AND active = true LIMIT 1', [attraction.attraction_id]);
        const slot = slotRes.rows[0] || null;
        if (slot) console.log('Using slot:', slot);

        // 3. Get a user
        const userRes = await pool.query('SELECT user_id FROM users LIMIT 1');
        const userId = userRes.rows.length ? userRes.rows[0].user_id : 1;

        // 4. Construct Payload
        // Use a weekend date to trigger dynamic pricing if configured? 
        // Or just tomorrow.
        const bookingDate = new Date();
        bookingDate.setDate(bookingDate.getDate() + 1);
        const dateStr = bookingDate.toISOString().split('T')[0];

        // Payload mimics what Bookings.jsx helper sends (roughly)
        const payload = [{
            item_type: 'Attraction',
            attraction_id: attraction.attraction_id,
            slot_id: slot ? slot.slot_id : null,
            booking_date: dateStr,
            quantity: 1,
            slot_start_time: slot ? slot.start_time : '10:00:00',
            user_id: userId
        }];

        console.log('Calling createBookings with payload:', JSON.stringify(payload, null, 2));

        const result = await bookingService.createBookings(payload);

        console.log('---------------------------------------------------');
        console.log('✅ Order Created Successfully');
        console.log('Order ID:', result.order_id);
        console.log('Total Amount (Gross):', result.order.total_amount);
        console.log('Discount Amount:', result.order.discount_amount);
        console.log('Final Amount (Net):', result.bookings[0].total_amount); // Booking total
        console.log('---------------------------------------------------');

        const basePrice = Number(attraction.base_price);
        const finalPrice = Number(result.order.total_amount);

        console.log(`Original Base Price in DB: ${basePrice}`);
        console.log(`Calculated Order Price: ${finalPrice}`);

        if (Math.abs(finalPrice - basePrice) > 0.01) {
            console.log('🎉 DYNAMIC PRICING IS WORKING! Price changed by: ' + (finalPrice - basePrice));
        } else {
            console.log('⚠️ Price matches base price. If you expected a change, check your dynamic pricing rules.');
        }

    } catch (err) {
        console.error('❌ Test failed:', err);
    } finally {
        await pool.end();
    }
}

test();
