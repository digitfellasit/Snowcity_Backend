// scripts/run_author_migration.js
require('dotenv').config();
const { runSqlFile, pool } = require('../config/db');
const path = require('path');

async function main() {
    try {
        const migrationPath = path.join(__dirname, '../migrations/20260304_add_image_alt_to_blogs.sql');
        console.log(`Running migration: ${migrationPath}`);
        await runSqlFile(migrationPath);
        console.log('✅ Migration successful');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
