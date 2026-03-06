const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { pool } = require('./config/db');
const fs = require('fs');

async function check() {
  const { rows: attractions } = await pool.query(`SELECT attraction_id, title, base_price FROM attractions`);

  const { rows: bookings } = await pool.query(`
    SELECT b.booking_id, b.item_type, b.total_amount, b.quantity, b.parent_booking_id, b.attraction_id, b.combo_id, a.title as a_title, a.base_price as a_base 
    FROM bookings b
    LEFT JOIN attractions a ON a.attraction_id = b.attraction_id
    WHERE b.parent_booking_id IS NOT NULL 
    LIMIT 5
  `);

  fs.writeFileSync('test_out.json', JSON.stringify({ attractions, bookings }, null, 2));
  process.exit(0);
}
check().catch(console.error);
