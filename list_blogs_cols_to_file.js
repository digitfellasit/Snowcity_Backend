require('dotenv').config();
const { pool } = require('./config/db');
const fs = require('fs');

async function listCols() {
    try {
        const { rows } = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'blogs'");
        const cols = rows.map(r => r.column_name).join('\n');
        fs.writeFileSync('blogs_columns.txt', cols);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

listCols();
