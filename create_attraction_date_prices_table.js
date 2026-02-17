const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { pool } = require('./config/db');
const fs = require('fs');

async function createAttractionDatePricesTable() {
  console.log('🔄 Creating attraction_date_prices table...');

  try {
    // First check if table exists
    const checkResult = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'attraction_date_prices'
    `);

    if (checkResult.rows.length > 0) {
      console.log('ℹ️ Table attraction_date_prices already exists');
      return;
    }

    // Create the table
    await pool.query(`
      CREATE TABLE attraction_date_prices (
        id SERIAL PRIMARY KEY,
        attraction_id INTEGER NOT NULL REFERENCES attractions(attraction_id) ON DELETE CASCADE,
        date DATE NOT NULL,
        price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(attraction_id, date)
      )
    `);

    // Create indexes
    await pool.query(`
      CREATE INDEX idx_attraction_date_prices_attraction_id ON attraction_date_prices(attraction_id);
      CREATE INDEX idx_attraction_date_prices_date ON attraction_date_prices(date);
      CREATE INDEX idx_attraction_date_prices_active ON attraction_date_prices(is_active);
    `);

    console.log('✅ Table attraction_date_prices created successfully!');

  } catch (error) {
    console.error('❌ Error creating table:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

createAttractionDatePricesTable();
