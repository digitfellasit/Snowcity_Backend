require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool, query, withTransaction } = require('../config/db');

async function migrate() {
    console.log('🚀 Starting database migrations...');

    try {
        // 1. Ensure migrations table exists
        await query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT NOW()
      );
    `);

        // 2. Read migration files
        const migrationsDir = path.join(__dirname, '../db/migrations');
        if (!fs.existsSync(migrationsDir)) {
            console.error(`❌ Migrations directory not found: ${migrationsDir}`);
            process.exit(1);
        }

        const files = fs.readdirSync(migrationsDir)
            .filter(f => f.endsWith('.sql'))
            .sort();

        // 3. Get applied migrations
        const { rows } = await query('SELECT version FROM schema_migrations');
        const applied = new Set(rows.map(r => r.version));
        console.log(`  Found ${applied.size} already applied migrations.`);

        // 4. Run pending migrations
        let count = 0;
        for (const file of files) {
            if (!applied.has(file)) {
                console.log(`  📄 RUNNING PENDING: ${file}`);
                const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

                if (!sql?.trim()) {
                    console.log(`  ⚠️ Skipping empty file: ${file}`);
                    await query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
                    continue;
                }

                try {
                    await withTransaction(async (client) => {
                        await client.query(sql);
                        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
                    });
                    console.log(`  ✅ Success: ${file}`);
                    count++;
                } catch (mErr) {
                    console.error(`  ❌ Failed: ${file}`);
                    console.error(mErr.message);
                    throw mErr; // Stop execution on failure
                }
            }
        }

        if (count === 0) {
            console.log('✨ Database is already up to date.');
        } else {
            console.log(`🎉 Finished! ${count} migrations applied successfully.`);
        }

    } catch (err) {
        console.error('❌ Migration process crashed:', err.message);
        process.exit(1);
    } finally {
        // End the pool so the script can exit
        await pool.end();
    }
}

migrate();
