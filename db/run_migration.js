require('dotenv').config();
const { pool } = require('../config/db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    try {
        const migrationPath = path.join(__dirname, 'migration_add_alt_columns.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        console.log('Running migration...');
        await pool.query(sql);
        console.log('Migration completed successfully.');

        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

runMigration();
