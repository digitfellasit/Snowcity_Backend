const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { pool } = require('./config/db');

async function checkBlogs() {
  try {
    const { rows } = await pool.query(
      `SELECT blog_id, title, created_at, updated_at, published_at
       FROM blogs
       WHERE active = TRUE
       ORDER BY COALESCE(published_at, created_at) DESC
       LIMIT 10`
    );
    console.log('--- Top 10 Blogs by COALESCE(published_at, created_at) DESC ---');
    console.table(rows);

    process.exit(0);
  } catch (err) {
    console.error('--- DB Error ---');
    console.error(err);
    process.exit(1);
  }
}

checkBlogs();
