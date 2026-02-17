const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { pool } = require('./config/db');

async function fixColumnName() {
  try {
    console.log('🔄 Renaming column from "date" to "price_date"...');

    // Rename the column
    await pool.query('ALTER TABLE attraction_date_prices RENAME COLUMN date TO price_date');

    console.log('✅ Column renamed successfully!');
    console.log('📋 attraction_date_prices table now has "price_date" column');
  } catch (error) {
    console.error('❌ Error renaming column:', error.message);
  } finally {
    await pool.end();
  }
}

fixColumnName();
