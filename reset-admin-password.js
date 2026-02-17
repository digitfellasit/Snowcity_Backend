// Reset admin password script
require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const { pool } = require('./config/db');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);

async function resetAdminPassword() {
  const client = await pool.connect();

  try {
    console.log('🔄 Resetting admin password...');

    // Reset password for admin@snowcity.local
    const newPassword = 'Admin123!';
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    const result = await client.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE email = $2 RETURNING user_id, name, email',
      [passwordHash, 'admin@snowcity.local']
    );

    if (result.rowCount > 0) {
      console.log('✅ Admin password reset successfully!');
      console.log('📧 Email: admin@snowcity.local');
      console.log('🔑 New Password:', newPassword);
      console.log('⚠️  Please change this password after first login!');
    } else {
      console.log('❌ Admin user not found. Creating new admin user...');

      // Create new admin user
      const createResult = await client.query(
        `INSERT INTO users (name, email, password_hash, otp_verified)
         VALUES ($1, $2, $3, TRUE)
         RETURNING user_id, name, email`,
        ['Super Admin', 'admin@snowcity.local', passwordHash]
      );

      console.log('✅ New admin user created!');
      console.log('📧 Email: admin@snowcity.local');
      console.log('🔑 Password:', newPassword);
    }

  } catch (error) {
    console.error('❌ Error resetting admin password:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

resetAdminPassword();
