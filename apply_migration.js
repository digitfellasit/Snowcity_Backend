require('dotenv').config();
const { pool } = require('./config/db');

async function run() {
  try {
    console.log('Running migration to drop record-level target requirement...');
    await pool.query('ALTER TABLE offer_rules DROP CONSTRAINT IF EXISTS offer_rules_target_required;');
    console.log('✅ Constraint removed successfully.');
    
    // Ensure schema_migrations table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    // Insert into schema_migrations so the runner skips it
    await pool.query('INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING', ['0029_remove_offer_target_constraint.sql']);
    console.log('✅ Migration record inserted into schema_migrations.');
  } catch (err) {
    console.error('❌ Error during migration:', err);
  } finally {
    await pool.end();
  }
}

run();
