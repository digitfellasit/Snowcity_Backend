
require('dotenv').config();
const { pool } = require('./config/db');
const fs = require('fs');

async function checkSchema() {
    try {
        const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'blogs'
    `);
        fs.writeFileSync('blogs_schema_v2.json', JSON.stringify(res.rows, null, 2));
        process.exit(0);
    } catch (err) {
        fs.writeFileSync('schema_error.txt', err.stack);
        process.exit(1);
    }
}

checkSchema();
