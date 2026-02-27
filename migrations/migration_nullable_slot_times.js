require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

/**
 * Migration: Make slot_start_time, slot_end_time, slot_label nullable
 * 
 * This allows bookings for attractions with time_slot_enabled = false
 * to be created without slot timing data.
 */
const { pool } = require('../config/db');

async function runMigration() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(`
            ALTER TABLE bookings ALTER COLUMN slot_start_time DROP NOT NULL
        `);
        console.log('✅ slot_start_time is now nullable');

        await client.query(`
            ALTER TABLE bookings ALTER COLUMN slot_end_time DROP NOT NULL
        `);
        console.log('✅ slot_end_time is now nullable');

        await client.query(`
            ALTER TABLE bookings ALTER COLUMN slot_label DROP NOT NULL
        `);
        console.log('✅ slot_label is now nullable');

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
