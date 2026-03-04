require('dotenv').config();
const { pool } = require('../config/db');
const fs = require('fs');

async function debugBlogs() {
    try {
        const activeCounts = await pool.query('SELECT active, count(*) FROM blogs GROUP BY active');
        const statusCounts = await pool.query('SELECT status, count(*) FROM blogs GROUP BY status');
        const samples = await pool.query('SELECT blog_id, title, active, status FROM blogs LIMIT 5');

        const result = {
            activeCounts: activeCounts.rows,
            statusCounts: statusCounts.rows,
            samples: samples.rows
        };

        fs.writeFileSync('debug_blogs_output.json', JSON.stringify(result, null, 2));
        console.log('✅ Debug results written to debug_blogs_output.json');
    } catch (err) {
        console.error('Debug failed:', err.message);
    } finally {
        await pool.end();
    }
}

debugBlogs();
