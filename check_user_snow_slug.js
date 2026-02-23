require('dotenv').config();
const { pool } = require('./config/db');
const fs = require('fs');

async function checkSlug(slug) {
    console.log(`--- Checking slug: ${slug} ---`);
    const results = {};

    const tables = [
        { name: 'attractions', slugCol: 'slug' },
        { name: 'blogs', slugCol: 'slug' },
        { name: 'cms_pages', slugCol: 'slug' },
        { name: 'combos', slugCol: 'slug' }
    ];

    for (const table of tables) {
        try {
            const { rows } = await pool.query(`SELECT * FROM ${table.name} WHERE ${table.slugCol} = $1`, [slug]);
            if (rows.length > 0) {
                results[table.name] = { found: true, data: rows[0] };
            } else {
                results[table.name] = { found: false };
            }
        } catch (err) {
            results[table.name] = { error: err.message };
        }
    }

    fs.writeFileSync('slug_check_result.json', JSON.stringify(results, null, 2));
    console.log('--- Done. Results written to slug_check_result.json ---');
    process.exit();
}

const slugToCheck = 'user-snow';
checkSlug(slugToCheck);
