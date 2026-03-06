const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { pool } = require('./config/db');
const fs = require('fs');

async function check() {
    const { rows } = await pool.query(`
    SELECT b.booking_id, b.item_type, b.total_amount, b.final_amount, b.parent_booking_id, 
           b.attraction_id, b.combo_id, o.order_ref, o.total_amount as o_total, o.final_amount as o_final
    FROM bookings b
    JOIN orders o ON b.order_id = o.order_id
    WHERE o.order_ref = 'SC3VGQ3R'
  `);

    const { rows: addons } = await pool.query(`
    SELECT ba.*, ad.title 
    FROM booking_addons ba 
    JOIN addons ad ON ad.addon_id = ba.addon_id 
    WHERE ba.booking_id IN (
      SELECT booking_id FROM bookings WHERE order_id IN (
        SELECT order_id FROM orders WHERE order_ref = 'SC3VGQ3R'
      )
    )
  `);

    fs.writeFileSync('test_out2.json', JSON.stringify({ rows, addons }, null, 2));
    process.exit(0);
}
check().catch(console.error);
