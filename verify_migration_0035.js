require('dotenv').config();
const { pool } = require('./config/db');

async function checkSchema() {
  try {
    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'banners' 
      AND column_name IN ('cta_text', 'link_url');
    `);
    console.log('Columns found:', res.rows);
    if (res.rows.length === 2) {
      console.log('✅ Columns cta_text and link_url are present in the banners table.');
    } else {
      console.log('❌ Columns not found or incomplete.');
    }
  } catch (err) {
    console.error('Error checking schema:', err.message);
  } finally {
    await pool.end();
  }
}

checkSchema();
