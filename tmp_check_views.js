require('dotenv').config();
const { pool } = require('./config/db');
const fs = require('fs');

async function checkViews() {
  try {
    const res = await pool.query("SELECT viewname, definition FROM pg_views WHERE schemaname = 'public'");
    fs.writeFileSync('tmp_views.json', JSON.stringify(res.rows, null, 2));
    console.log('Views written to tmp_views.json');
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

checkViews();
