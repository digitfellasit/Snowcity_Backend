require('dotenv').config();
const { pool } = require('../config/db');
const fs = require('fs');

async function verifyData() {
    try {
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
      LIMIT 5
    `);

        const countRes = await pool.query(`SELECT 
      count(*) as total,
      count(author_description) as with_author_desc,
      count(seo_title) as with_seo_title,
      count(seo_description) as with_seo_desc
    FROM blogs`);

        const results = {
            samples: res.rows,
            stats: countRes.rows[0]
        };

        fs.writeFileSync('verification_output.json', JSON.stringify(results, null, 2));
        console.log('✅ Verification results written to verification_output.json');

    } catch (err) {
        console.error('Verification failed:', err.message);
    } finally {
        await pool.end();
    }
}

verifyData();
