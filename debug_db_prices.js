require('dotenv').config();
const { pool } = require('./config/db');
const fs = require('fs');

async function debugPrices() {
    try {
        console.log('🔍 Checking database prices...');
        const results = {};

        // Check Orders with timestamps
        const orders = await pool.query('SELECT order_id, total_amount, discount_amount, final_amount, payment_status, created_at FROM orders ORDER BY created_at DESC LIMIT 20');
        results.orders = orders.rows;

        fs.writeFileSync('debug_orders_recent.json', JSON.stringify(results, null, 2));
        console.log('✅ Results written to debug_orders_recent.json');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error debugging prices:', error);
        process.exit(1);
    }
}

debugPrices();
