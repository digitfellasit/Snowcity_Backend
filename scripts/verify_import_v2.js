require('dotenv').config();
const { pool } = require('../config/db');

async function checkCount() {
    try {
        const total = await pool.query('SELECT count(*) FROM blogs');
        const withWpId = await pool.query('SELECT count(*) FROM blogs WHERE wp_id IS NOT NULL');
        const noWpId = await pool.query('SELECT count(*) FROM blogs WHERE wp_id IS NULL');

        console.log(`Total blogs in database: ${total.rows[0].count}`);
        console.log(`Blogs WITH wp_id: ${withWpId.rows[0].count}`);
        console.log(`Blogs with NO wp_id: ${noWpId.rows[0].count}`);

        const duplicates = await pool.query('SELECT slug, count(*) FROM blogs GROUP BY slug HAVING count(*) > 1');
        console.log(`\nDuplicate slugs found: ${duplicates.rows.length}`);

    } catch (err) {
        console.error('Error during verification:', err.message);
    } finally {
        await pool.end();
    }
}

checkCount();
