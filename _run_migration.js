require('dotenv').config();
const { pool } = require('./config/db');

async function run() {
  const client = await pool.connect();
  try {
    console.log('Connected to DB, running migration...');

    await client.query("ALTER TYPE offer_rule_type ADD VALUE IF NOT EXISTS 'first_n_tickets'");
    console.log('✓ Added first_n_tickets to ENUM');

    await client.query('ALTER TABLE offer_rules ADD COLUMN IF NOT EXISTS ticket_limit INTEGER DEFAULT NULL');
    console.log('✓ Added ticket_limit column');

    await client.query('ALTER TABLE offer_rules ADD COLUMN IF NOT EXISTS offer_price NUMERIC(10,2) DEFAULT NULL');
    console.log('✓ Added offer_price column');

    console.log('✅ Migration completed successfully!');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
