require('dotenv').config();
const { pool } = require('../config/db');

async function verifyData() {
    try {
        console.log('Verifying imported data...');
        const res = await pool.query(`
      SELECT 
        title, 
        author, 
        author_description, 
        seo_title, 
        seo_description, 
        published_at,
        categories
      FROM blogs 
      WHERE wp_id IS NOT NULL 
      LIMIT 3
    `);

        console.log('\n--- Sample Imported Blogs ---');
        res.rows.forEach((row, i) => {
            console.log(`\nBlog ${i + 1}: ${row.title}`);
            console.log(`- Author: ${row.author}`);
            console.log(`- Author Description: ${row.author_description ? row.author_description.substring(0, 100) + '...' : 'NONE'}`);
            console.log(`- SEO Title: ${row.seo_title}`);
            console.log(`- SEO Description: ${row.seo_description}`);
            console.log(`- Published At: ${row.published_at}`);
            console.log(`- Categories: ${row.categories}`);
        });

        const countRes = await pool.query('SELECT count(*) FROM blogs');
        console.log(`\nTotal blogs in database: ${countRes.rows[0].count}`);

    } catch (err) {
        console.error('Verification failed:', err.message);
    } finally {
        await pool.end();
    }
}

verifyData();
