require('dotenv').config();
const { pool } = require('./config/db');

async function check() {
    try {
        const { rows: tables } = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        const tableNames = tables.map(r => r.table_name);
        console.log('TABLES:', tableNames.join(', '));

        const checkSpecs = {
            attractions: ['image_url', 'image_alt', 'desktop_image_url', 'desktop_image_alt'],
            combos: ['image_url', 'image_alt', 'desktop_image_url', 'desktop_image_alt'],
            banners: ['web_image', 'web_image_alt', 'mobile_image', 'mobile_image_alt'],
            blogs: ['image_url', 'image_alt'],
            offers: ['image_url', 'image_alt'],
            cms_pages: ['hero_image', 'hero_image_alt', 'image_url', 'image_alt'],
            pages: ['image_url', 'image_alt', 'hero_image', 'hero_image_alt']
        };

        for (const [table, columns] of Object.entries(checkSpecs)) {
            if (!tableNames.includes(table)) {
                console.log(`\n--- Table ${table} DOES NOT EXIST ---`);
                continue;
            }
            console.log(`\n--- Checking table: ${table} ---`);
            const { rows: allCols } = await pool.query(
                "SELECT column_name FROM information_schema.columns WHERE table_name = $1",
                [table]
            );
            const colList = allCols.map(r => r.column_name);

            for (const col of columns) {
                console.log(`${col}: ${colList.includes(col) ? 'EXISTS' : 'MISSING'}`);
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
