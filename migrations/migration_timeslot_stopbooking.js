require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

/**
 * Migration: Add time_slot_enabled and stop_booking columns
 * 
 * - attractions.time_slot_enabled (boolean, default true)
 * - attractions.stop_booking (boolean, default false)
 * - combos.stop_booking (boolean, default false)
 */
const { pool } = require('../config/db');

async function runMigration() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Add time_slot_enabled to attractions (default true so existing attractions keep slots)
        await client.query(`
      ALTER TABLE attractions 
      ADD COLUMN IF NOT EXISTS time_slot_enabled BOOLEAN DEFAULT true
    `);
        console.log('✅ Added time_slot_enabled column to attractions');

        // 2. Add stop_booking to attractions
        await client.query(`
      ALTER TABLE attractions 
      ADD COLUMN IF NOT EXISTS stop_booking BOOLEAN DEFAULT false
    `);
        console.log('✅ Added stop_booking column to attractions');

        // 3. Add stop_booking to combos
        await client.query(`
      ALTER TABLE combos 
      ADD COLUMN IF NOT EXISTS stop_booking BOOLEAN DEFAULT false
    `);
        console.log('✅ Added stop_booking column to combos');

        await client.query('COMMIT');
        console.log('\n🎉 Migration completed successfully!');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', err.message);
        throw err;
    } finally {
        client.release();
    }
}

runMigration()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
