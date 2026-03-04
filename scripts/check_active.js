require('dotenv').config();
const { pool } = require('../config/db');

async function checkActive() {
    try {
        const res = await pool.query('SELECT active, count(*) FROM blogs GROUP BY active');
        console.log('Blog Active Status Counts:');
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (err) {
        console.error('Error checking active status:', err.message);
    } finally {
        await pool.end();
    }
}

checkActive();
