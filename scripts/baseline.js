require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool, query } = require('../config/db');

async function baseline() {
    console.log('🚀 Baselining migrations...');
    try {
        // Ensure table exists
        await query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT NOW()
      );
    `);

        const migrationsDir = path.join(__dirname, '../db/migrations');
        const files = fs.readdirSync(migrationsDir)
            .filter(f => f.endsWith('.sql'))
            .sort();

        let count = 0;
        for (const file of files) {
            if (file < '0027_create_announcements_table.sql') {
                const { rowCount } = await query('INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING', [file]);
                if (rowCount > 0) {
                    console.log(`  ✅ Baselined: ${file}`);
                    count++;
                }
            }
        }
        console.log(`✨ Baseline complete. ${count} files marked as applied.`);
    } catch (err) {
        console.error('❌ Baseline failed:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

baseline();
