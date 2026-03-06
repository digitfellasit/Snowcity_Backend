const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { pool } = require('./config/db');
const fs = require('fs');

async function check() {
    const { rows: bookings } = await pool.query(`
    SELECT 
      b.booking_id, b.item_type, b.total_amount, b.final_amount, b.quantity, b.parent_booking_id,
      (SELECT SUM(price*quantity) FROM booking_addons WHERE booking_id = b.booking_id) as addons_total
    FROM bookings b 
    WHERE b.booking_id IN (SELECT booking_id FROM booking_addons) 
    LIMIT 5
  `);
    fs.writeFileSync('test_out4.json', JSON.stringify(bookings, null, 2));
    process.exit(0);
}
check().catch(console.error);
