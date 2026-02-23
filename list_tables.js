require('dotenv').config();
const { pool } = require('./config/db');

async function list() {
    try {
        const { rows } = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        console.log('--- TABLES START ---');
        rows.forEach(r => console.log(r.table_name));
        console.log('--- TABLES END ---');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

list();
