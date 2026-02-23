require('dotenv').config();
const { pool } = require('./config/db');

async function migrate() {
    try {
        console.log('Running migration to add SEO fields...');
        await pool.query(`
      ALTER TABLE attractions 
      ADD COLUMN IF NOT EXISTS faq_items JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS head_schema TEXT,
      ADD COLUMN IF NOT EXISTS body_schema TEXT,
      ADD COLUMN IF NOT EXISTS footer_schema TEXT;
    `);

        await pool.query(`
      ALTER TABLE combos 
      ADD COLUMN IF NOT EXISTS faq_items JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS head_schema TEXT,
      ADD COLUMN IF NOT EXISTS body_schema TEXT,
      ADD COLUMN IF NOT EXISTS footer_schema TEXT;
    `);

        console.log('Migration successful.');

        // Verify
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
        resAttractions.rows.forEach(r => console.log(`${r.column_name}: ${r.data_type}`));

        console.log('--- Combos Table Columns ---');
        resCombos.rows.forEach(r => console.log(`${r.column_name}: ${r.data_type}`));

    } catch (err) {
        console.error('Error in migration:', err);
    } finally {
        await pool.end();
    }
}

migrate();
