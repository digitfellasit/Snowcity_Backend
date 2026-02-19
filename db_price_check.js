require('dotenv').config();
const { pool } = require('./config/db');

async function checkPrices() {
    try {
        const res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'attractions'");
        console.log('Columns:', JSON.stringify(res.rows, null, 2));

        const sample = await pool.query("SELECT * FROM attractions LIMIT 1");
        console.log('Sample Row:', JSON.stringify(sample.rows[0], null, 2));

        const orders = await pool.query("SELECT * FROM orders WHERE order_id = 248");
        console.log('Order 248:', JSON.stringify(orders.rows[0], null, 2));
    } catch (err) {
        console.error('Error querying database:', err.message);
    } finally {
        process.exit();
    }
}

checkPrices();
