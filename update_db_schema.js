require('dotenv').config();
const { pool } = require('./config/db');

async function run() {
    try {
        console.log('Altering attractions table...');
        await pool.query(\`
      ALTER TABLE attractions 
      ADD COLUMN IF NOT EXISTS faq_items JSONB DEFAULT '[]'::jsonb, 
      ADD COLUMN IF NOT EXISTS head_schema TEXT, 
      ADD COLUMN IF NOT EXISTS body_schema TEXT, 
      ADD COLUMN IF NOT EXISTS footer_schema TEXT
    \`);
    console.log('Altering combos table...');
    await pool.query(\`
      ALTER TABLE combos 
      ADD COLUMN IF NOT EXISTS faq_items JSONB DEFAULT '[]'::jsonb, 
      ADD COLUMN IF NOT EXISTS head_schema TEXT, 
      ADD COLUMN IF NOT EXISTS body_schema TEXT, 
      ADD COLUMN IF NOT EXISTS footer_schema TEXT
    \`);
    console.log('Database schema successfully updated.');
  } catch (err) {
    console.error('Error updating schema:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

run();
