require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { pool } = require('../config/db');

async function run() {
    try {
        console.log('🔌 Connecting to database...');
        const client = await pool.connect();
        try {
            console.log('🔄 Adding "PayPhi" to payment_mode enum...');
            await client.query(`ALTER TYPE payment_mode ADD VALUE IF NOT EXISTS 'PayPhi'`);
            console.log('✅ Successfully added "PayPhi" to payment_mode enum.');
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('❌ Error updating enum:', err);
    } finally {
        await pool.end();
    }
}

run();
