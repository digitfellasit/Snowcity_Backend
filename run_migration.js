/**
 * Run a single SQL migration file.
 * Usage: node run_migration.js <path-to-sql-file>
 * Example: node run_migration.js db/migrations/0031_add_section_placement.sql
 */
require('dotenv').config();
const { runSqlFile, pool } = require('./config/db');
const path = require('path');

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node run_migration.js <path-to-sql-file>');
    process.exit(1);
  }
  const fullPath = path.resolve(__dirname, file);
  console.log(`\n🔄 Running migration: ${fullPath}\n`);
  try {
    await runSqlFile(fullPath);
    console.log('✅ Migration completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
