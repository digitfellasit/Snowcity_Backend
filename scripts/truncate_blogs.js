require('dotenv').config();
const { pool } = require('../config/db');

async function truncateBlogs() {
    try {
        console.log('Truncating blogs table...');
        await pool.query('TRUNCATE TABLE blogs RESTART IDENTITY CASCADE');
        console.log('✅ Blogs table truncated successfully.');
    } catch (err) {
        console.error('❌ Truncation failed:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

truncateBlogs();
