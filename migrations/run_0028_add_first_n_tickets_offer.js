#!/usr/bin/env node

/**
 * Migration Runner: Add First N Tickets Offer Support
 * 
 * Run via: node migrations/run_0028_add_first_n_tickets_offer.js
 */

const { pool } = require('../config/db');

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('Starting migration: Add First N Tickets Offer Support...');

    // Step 1: Add ENUM value (must be outside transaction in PG)
    try {
      await client.query("ALTER TYPE offer_rule_type ADD VALUE IF NOT EXISTS 'first_n_tickets'");
      console.log('✓ Added first_n_tickets to offer_rule_type ENUM');
    } catch (err) {
      if (err.message.includes('already exists') || err.message.includes('duplicate')) {
        console.log('⚠ first_n_tickets ENUM value already exists, skipping');
      } else {
        throw err;
      }
    }

    // Step 2: Add columns
    await client.query('ALTER TABLE offer_rules ADD COLUMN IF NOT EXISTS ticket_limit INTEGER DEFAULT NULL');
    console.log('✓ Added ticket_limit column');

    await client.query('ALTER TABLE offer_rules ADD COLUMN IF NOT EXISTS offer_price NUMERIC(10, 2) DEFAULT NULL');
    console.log('✓ Added offer_price column');

    console.log('\n✅ Migration completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

runMigration();
