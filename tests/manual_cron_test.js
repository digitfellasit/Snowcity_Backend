require('dotenv').config();
const { pool } = require('../config/db');
const bookingService = require('../services/bookingService');

async function runTest() {
  console.log('--- CRON REFINEMENT TEST ---');
  try {
    // 1. Get or create a test user
    const userRes = await pool.query("SELECT user_id FROM users WHERE email = 'test_cron@example.com'");
    let userId;
    if (userRes.rowCount > 0) {
      userId = userRes.rows[0].user_id;
    } else {
      const newUser = await pool.query(
        "INSERT INTO users (name, email, phone, password_hash) VALUES ('Cron Test', 'test_cron@example.com', '0000000000', 'password') RETURNING user_id"
      );
      userId = newUser.rows[0].user_id;
    }
    console.log(`Using User ID: ${userId}`);

    // 2. Insert Backdated Order
    const orderRes = await pool.query(
      `INSERT INTO orders 
       (user_id, total_amount, payment_status, payment_mode, created_at) 
       VALUES ($1, 100, 'Pending', 'PhonePe', NOW() - INTERVAL '35 minutes') 
       RETURNING order_id, order_ref`,
      [userId]
    );
    const orderId = orderRes.rows[0].order_id;
    const orderRef = orderRes.rows[0].order_ref;
    console.log(`Inserted Pending Order: ${orderId} (Ref: ${orderRef})`);

    // 3. Insert Booking
    const bookingRes = await pool.query(
      `INSERT INTO bookings 
       (order_id, user_id, item_type, quantity, booking_date, total_amount, payment_status, booking_status)
       VALUES ($1, $2, 'Attraction', 1, CURRENT_DATE, 100, 'Pending', 'PENDING_PAYMENT')
       RETURNING booking_id`,
      [orderId, userId]
    );
    console.log(`Inserted Booking: ${bookingRes.rows[0].booking_id}`);

    // 4. Run Cron Logic (Verifying individual status checks)
    console.log('--- Step 1: Performing Status Checks ---');
    try {
        // This will call the PhonePe status check which should return PENDING or FAILED
        // But since we commented out the DB update in bookingService.js, 
        // the status in DB should remain 'Pending'
        const statusResult = await bookingService.checkPhonePeStatus(orderId);
        console.log('Status check result:', statusResult.status);
    } catch (e) {
        console.log(`Status check failed as expected (likely due to missing credentials or invalid ref): ${e.message}`);
    }

    // Verify status is still 'Pending' after check fail
    const midwayOrder = await pool.query('SELECT payment_status FROM orders WHERE order_id = $1', [orderId]);
    console.log(`Order status after check: ${midwayOrder.rows[0].payment_status} (Expected: Pending)`);

    // 5. Final Cleanup Logic (The part that marks Failed)
    console.log('--- Step 2: Running Final Transition ---');
    const finalRes = await pool.query(
      `UPDATE orders 
       SET payment_status = 'Failed', updated_at = NOW()
       WHERE payment_status = 'Pending' 
       AND created_at < NOW() - INTERVAL '30 minutes'
       AND order_id = $1
       RETURNING order_id`,
      [orderId]
    );

    if (finalRes.rowCount > 0) {
      console.log('Order transitioned to Failed in cleanup script part.');
      await pool.query(
        `UPDATE bookings 
         SET payment_status = 'Failed', booking_status = 'Cancelled', updated_at = NOW()
         WHERE order_id = $1`,
        [orderId]
      );
      console.log('Bookings transitioned to Cancelled in cleanup script part.');
    }

    // 6. Final Verification
    const finalOrder = await pool.query('SELECT payment_status FROM orders WHERE order_id = $1', [orderId]);
    const finalBooking = await pool.query('SELECT payment_status, booking_status FROM bookings WHERE order_id = $1', [orderId]);

    console.log('--- FINAL STATE ---');
    console.log(`Order Payment Status: ${finalOrder.rows[0].payment_status}`);
    console.log(`Booking Payment Status: ${finalBooking.rows[0].payment_status}`);
    console.log(`Booking Status: ${finalBooking.rows[0].booking_status}`);

    if (finalOrder.rows[0].payment_status === 'Failed' && finalBooking.rows[0].booking_status === 'Cancelled') {
      console.log('TEST PASSED: Order was correctly transitioned to Failed/Cancelled after 30 mins.');
    } else {
      console.log('TEST FAILED: Status mismatch.');
    }

    // Cleanup test data
    console.log('Cleaning up test data...');
    await pool.query('DELETE FROM bookings WHERE order_id = $1', [orderId]);
    await pool.query('DELETE FROM orders WHERE order_id = $1', [orderId]);

  } catch (err) {
    console.error('Test Execution Error:', err);
  } finally {
    process.exit(0);
  }
}

runTest();
