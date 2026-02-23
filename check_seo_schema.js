require('dotenv').config();
const { pool } = require('./config/db');

async function checkSchema() {
    try {
        const resAttractions = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'attractions' 
      AND column_name IN ('faq_items', 'head_schema', 'body_schema', 'footer_schema');
    `);

        const resCombos = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'combos' 
      AND column_name IN ('faq_items', 'head_schema', 'body_schema', 'footer_schema');
    `);

        console.log('--- Attractions Table Columns ---');
        console.log(JSON.stringify(resAttractions.rows, null, 2));

        console.log('\n--- Combos Table Columns ---');
        console.log(JSON.stringify(resCombos.rows, null, 2));

    } catch (err) {
        console.error('Error checking schema:', err);
    } finally {
        // End the pool so Node process exits
        await pool.end();
    }
}

checkSchema();
