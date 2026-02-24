const authService = require('../../services/authService');
const { loadUserScopes } = require('../middleware/scopedAccess');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendMail } = require('../../config/mailer');

// Helper function to load user roles
async function loadUserRoles(userId) {
  const { pool } = require('../../config/db');
  const { rows } = await pool.query(
    `SELECT LOWER(r.role_name) AS role_name
     FROM user_roles ur
     JOIN roles r ON r.role_id = ur.role_id
     WHERE ur.user_id = $1`,
    [userId]
  );
  return rows.map((r) => r.role_name);
}

// Admin login endpoint - same as regular login but specifically for admin panel
exports.adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Use the same login logic as regular auth
    const result = await authService.login({ email, password });

    // Load roles and scopes for the user
    const userId = result.user?.user_id;
    const roles = userId ? await loadUserRoles(userId) : [];
    const scopes = userId ? await loadUserScopes(userId) : {};

    // Ensure the user has admin access (our middleware now grants this to all authenticated users)
    res.json({
      ...result,
      isAdmin: true, // Explicitly mark as admin login
      message: 'Admin login successful',
      user: {
        ...result.user,
        roles,
        scopes // Include scopes so frontend can filter dropdowns
      }
    });

  } catch (err) {
    // Return the error in a format that matches what the frontend expects
    const status = err.status || err.statusCode || 500;
    res.status(status).json({
      error: err.message || 'Admin login failed',
      message: err.message || 'Admin access denied'
    });
  }
};

// Admin logout endpoint
exports.adminLogout = async (req, res, next) => {
  try {
    if (req.user?.id) {
      await authService.logout(req.user.id);
    }
    res.json({ message: 'Admin logout successful' });
  } catch (err) {
    next(err);
  }
};

// Admin password change endpoint
exports.adminChangePassword = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const err = new Error('Unauthorized');
      err.status = 401;
      throw err;
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      const err = new Error('Current password and new password are required');
      err.status = 400;
      throw err;
    }

    if (newPassword.length < 8) {
      const err = new Error('New password must be at least 8 characters long');
      err.status = 400;
      throw err;
    }

    // Verify current password
    const { pool } = require('../../config/db');
    const { rows } = await pool.query(
      'SELECT password_hash FROM users WHERE user_id = $1',
      [userId]
    );

    if (!rows[0] || !rows[0].password_hash) {
      const err = new Error('Password not set for this account');
      err.status = 400;
      throw err;
    }

    const isValid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!isValid) {
      const err = new Error('Current password is incorrect');
      err.status = 400;
      throw err;
    }

    // Hash new password
    const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE user_id = $2',
      [newPasswordHash, userId]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
};

// Admin forgot password endpoint
exports.adminForgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      const err = new Error('Email is required');
      err.status = 400;
      throw err;
    }

    // Check if user exists
    const { pool } = require('../../config/db');
    const { rows } = await pool.query(
      'SELECT user_id, name FROM users WHERE email = $1',
      [email]
    );

    if (!rows[0]) {
      // Don't reveal if email exists or not for security
      res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
      return;
    }

    const user = rows[0];

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const resetTokenExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store reset token
    await pool.query(
      'UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE user_id = $3',
      [resetTokenHash, resetTokenExpiry, user.user_id]
    );

    // Send reset email
    const resetUrl = `${process.env.FRONTEND_URL || 'https://app.snowcityblr.com'}/admin/reset-password?token=${resetToken}`;
    const mailOptions = {
      to: email,
      subject: 'SnowCity Admin - Password Reset',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1f2937;">SnowCity Admin - Password Reset</h2>
          <p>Hello ${user.name},</p>
          <p>You have requested to reset your password for your SnowCity admin account.</p>
          <p>Please click the link below to reset your password:</p>
          <p style="margin: 20px 0;">
            <a href="${resetUrl}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a>
          </p>
          <p><strong>This link will expire in 10 minutes.</strong></p>
          <p>If you did not request this password reset, please ignore this email.</p>
          <p>For security reasons, please do not share this email with anyone.</p>
          <br>
          <p>Best regards,<br>SnowCity Team</p>
        </div>
      `
    };

    await sendMail(mailOptions);

    res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
  } catch (err) {
    next(err);
  }
};

// Admin reset password endpoint
exports.adminResetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      const err = new Error('Token and new password are required');
      err.status = 400;
      throw err;
    }

    if (newPassword.length < 8) {
      const err = new Error('Password must be at least 8 characters long');
      err.status = 400;
      throw err;
    }

    // Hash the provided token
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid reset token
    const { pool } = require('../../config/db');
    const { rows } = await pool.query(
      'SELECT user_id FROM users WHERE reset_token = $1 AND reset_token_expiry > NOW()',
      [tokenHash]
    );

    if (!rows[0]) {
      const err = new Error('Invalid or expired reset token');
      err.status = 400;
      throw err;
    }

    const userId = rows[0].user_id;

    // Hash new password
    const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update password and clear reset token
    await pool.query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL, updated_at = NOW() WHERE user_id = $2',
      [newPasswordHash, userId]
    );

    res.json({ message: 'Password has been reset successfully' });
  } catch (err) {
    next(err);
  }
};

// Admin profile endpoint
exports.adminProfile = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      const err = new Error('Unauthorized');
      err.status = 401;
      throw err;
    }

    // Get user data from database
    const { pool } = require('../../config/db');
    const { rows } = await pool.query(
      'SELECT user_id, name, email, phone, otp_verified, last_login_at, created_at, updated_at FROM users WHERE user_id = $1',
      [userId]
    );

    if (!rows[0]) {
      const err = new Error('User not found');
      err.status = 404;
      throw err;
    }

    const user = rows[0];

    // Load user roles
    const roles = await loadUserRoles(userId);

    res.json({
      user: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        otp_verified: user.otp_verified,
        last_login_at: user.last_login_at,
        created_at: user.created_at,
        updated_at: user.updated_at,
        roles
      }
    });
  } catch (err) {
    next(err);
  }
};
