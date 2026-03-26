require('dotenv').config();
const { pool } = require('./config/db');
const fs = require('fs');

async function check() {
  const tables = ['attractions', 'combos', 'offers', 'promo_cards'];
  const results = {};
  try {
    for (const t of tables) {
      const { rows } = await pool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name = $1",
        [t]
      );
      results[t] = rows.map(r => r.column_name).sort();
    }
    fs.writeFileSync('tmp_schema.json', JSON.stringify(results, null, 2));
    console.log('Schema written to tmp_schema.json');
  } catch (err) {
    console.error('Check failed:', err.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

check();
