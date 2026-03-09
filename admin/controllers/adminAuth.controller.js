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
      'SELECT user_id, name, email FROM users WHERE email = $1',
      [email]
    );

    // Corporate Response: Always mention the email for clarity, but be vague if it doesn't exist for security
    const successMsg = `If an account with email ${email} exists, a password reset link has been sent to it.`;

    if (!rows[0]) {
      res.json({ message: successMsg, email });
      return;
    }

    const user = rows[0];

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const resetTokenExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes for better corporate standards

    // Store reset token
    await pool.query(
      'UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE user_id = $3',
      [resetTokenHash, resetTokenExpiry, user.user_id]
    );

    // Send reset email
    const frontendUrl = process.env.CLIENT_URL?.split(',')[0] || 'https://snowcity.vercel.app';
    const resetUrl = `${frontendUrl}/parkpanel/reset-password?token=${resetToken}`;
    const mailOptions = {
      to: email,
      subject: 'SnowCity - Admin Password Reset Request',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            .container { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #f9fafb; }
            .card { background-color: #ffffff; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #e5e7eb; }
            .logo { font-size: 24px; font-weight: 800; color: #003de6; margin-bottom: 24px; text-align: center; }
            .title { font-size: 20px; font-weight: 700; color: #111827; margin-bottom: 16px; }
            .text { color: #4b5563; line-height: 1.6; margin-bottom: 24px; }
            .button { display: inline-block; background-color: #003de6; color: #ffffff !important; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; text-align: center; }
            .footer { margin-top: 32px; font-size: 12px; color: #9ca3af; text-align: center; }
            .expiry { font-size: 13px; color: #6b7280; font-style: italic; margin-top: 16px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo">SNOWCITY</div>
            <div class="card">
              <div class="title">Password Reset Request</div>
              <p class="text">Hello ${user.name || 'Admin'},</p>
              <p class="text">We received a request to reset your password for the SnowCity admin dashboard. If you didn't make this request, you can safely ignore this email.</p>
              <div style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </div>
              <p class="expiry">This link is valid for 30 minutes for security purposes.</p>
              <p class="text" style="margin-top: 24px;">For your security, never share this link with anyone.</p>
            </div>
            <div class="footer">
              &copy; ${new Date().getFullYear()} SnowCity. All rights reserved.<br>
              This is an automated message, please do not reply.
            </div>
          </div>
        </body>
        </html>
      `
    };

    await sendMail(mailOptions);

    res.json({ message: successMsg, email });
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
      'SELECT user_id, name, email FROM users WHERE reset_token = $1 AND reset_token_expiry > NOW()',
      [tokenHash]
    );

    if (!rows[0]) {
      const err = new Error('The password reset link is invalid or has expired');
      err.status = 400;
      throw err;
    }

    const user = rows[0];

    // Hash new password
    const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
    const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update password and clear reset token
    await pool.query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL, updated_at = NOW() WHERE user_id = $2',
      [newPasswordHash, user.user_id]
    );

    // Send confirmation email
    await sendMail({
      to: user.email,
      subject: 'SnowCity - Password Changed Successfully',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #111827;">Password Changed</h2>
          <p>Hello ${user.name},</p>
          <p>Your password for the SnowCity admin account associated with <b>${user.email}</b> has been successfully reset.</p>
          <p>If you did not perform this action, please contact support immediately.</p>
          <p>Best regards,<br>SnowCity Team</p>
        </div>
      `
    });

    res.json({ message: 'Your password has been successfully reset and is ready to use.' });
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
