require('dotenv').config();
const { pool } = require('./config/db');

async function getRecentOrder() {
    try {
        const query = `
            SELECT o.order_id, o.order_ref, u.email, u.phone 
            FROM orders o 
            JOIN users u ON o.user_id = u.user_id 
            WHERE o.payment_status = 'Completed' 
            ORDER BY o.created_at DESC 
            LIMIT 1;
        `;
        const { rows } = await pool.query(query);
        if (rows.length === 0) {
            console.log('No completed orders found.');
        } else {
            console.log('ORDER_DATA:' + JSON.stringify(rows[0]));
        }
    } catch (err) {
        console.error('Error fetching order:', err);
    } finally {
        await pool.end();
    }
}

getRecentOrder();
