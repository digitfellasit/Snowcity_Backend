require('dotenv').config();
const { pool } = require('./config/db');

async function listCols() {
    try {
        const { rows } = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'cms_pages'");
        console.log('--- CMS_PAGES COLUMNS START ---');
        rows.forEach(r => console.log(r.column_name));
        console.log('--- CMS_PAGES COLUMNS END ---');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

listCols();
