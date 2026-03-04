require('dotenv').config();
const { pool } = require('../config/db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    const sqlPath = path.join(__dirname, '../migrations/20260304_update_blogs_schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    try {
        console.log('Applying migration...');
        await pool.query(sql);
        console.log('✅ Migration applied successfully.');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigration();
