require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const { pool } = require('./config/db');
const fs = require('fs');
const path = require('path');

async function runPasswordResetMigration() {
  const client = await pool.connect();

  try {
    console.log('🔄 Running password reset columns migration...');

    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', 'add_password_reset_columns.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Execute migration
    await client.query(migrationSQL);

    console.log('✅ Password reset columns migration completed successfully!');
    console.log('📋 Added columns:');
    console.log('   - reset_token (VARCHAR(255))');
    console.log('   - reset_token_expiry (TIMESTAMP WITH TIME ZONE)');
    console.log('   - Indexes for performance');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runPasswordResetMigration();
