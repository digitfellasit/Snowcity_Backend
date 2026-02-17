const { pool } = require('../config/db');
const fs = require('fs');
const path = require('path');

async function runAttractionDatePricesMigration() {
  console.log('🔄 Running attraction_date_prices table migration...');

  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, 'create_attraction_date_prices_table.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Execute the migration
    await pool.query(migrationSQL);

    console.log('✅ Migration completed successfully!');
    console.log('📋 Created table: attraction_date_prices');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runAttractionDatePricesMigration();
