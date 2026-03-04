require('dotenv').config();
const { pool } = require('../config/db');

async function checkCount() {
    try {
        const res = await pool.query('SELECT count(*) FROM blogs');
        console.log(`Total blogs in database: ${res.rows[0].count}`);

        const errors = await pool.query('SELECT count(*) FROM blogs WHERE wp_id IS NULL');
        console.log(`Blogs with NO wp_id: ${errors.rows[0].count}`);

        const sample = await pool.query('SELECT title, slug, wp_id FROM blogs LIMIT 5');
        console.log('\nSample posts:');
        sample.rows.forEach(r => console.log(`- ${r.title} (ID: ${r.wp_id})`));

    } catch (err) {
        console.error('Error during verification:', err.message);
    } finally {
        await pool.end();
    }
}

checkCount();
