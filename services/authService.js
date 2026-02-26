const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const otpGenerator = require('otp-generator');
const { pool, withTransaction } = require('../config/db');
const usersModel = require('../models/users.model');
const logger = require('../config/logger');
const { sendMail } = require('../config/mailer');
const { sendSMS } = require('../config/twilio');

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_SECRET = process.env.JWT_SECRET || 'change_me';
const FIXED_TEST_OTP = process.env.FIXED_TEST_OTP || '';

function signJwt(payload, options = {}) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN, ...options });
}

async function ensureRole(client, roleName) {
  const name = String(roleName).toLowerCase();
  const sel = await client.query(`SELECT role_id FROM roles WHERE LOWER(role_name) = $1`, [name]);
  if (sel.rows[0]) return sel.rows[0].role_id;
  const ins = await client.query(
    `INSERT INTO roles (role_name, description) VALUES ($1, $2) RETURNING role_id`,
    [name, `${name} role`]
  );
  return ins.rows[0].role_id;
}

async function register({ name, email, phone = null, password = null, isAdmin = false, whatsapp_consent = false }) {
  // For regular users, password is optional (passwordless)
  // For admin users, password is required
  let password_hash = null;
  if (password) {
    password_hash = await bcrypt.hash(String(password), SALT_ROUNDS);
  } else if (isAdmin) {
    const err = new Error('Password is required for admin users');
    err.status = 400;
    throw err;
  }

  const user = await withTransaction(async (client) => {
    // create user
    const { rows } = await client.query(
      `INSERT INTO users (name, email, phone, password_hash, otp_verified, whatsapp_consent)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING user_id, name, email, phone, otp_verified, last_login_at, created_at, updated_at, whatsapp_consent`,
      [name, email, phone, password_hash, !!phone ? false : true, whatsapp_consent]
    );
    const u = rows[0];

    // ensure "user" role (or admin role if isAdmin)
    const roleName = isAdmin ? 'admin' : 'user';
    const roleId = await ensureRole(client, roleName);
    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [u.user_id, roleId]
    );
    return u;
  });

  // For passwordless users, they need to verify OTP first
  // Only generate token if password was provided (admin flow)
  if (password_hash) {
    const token = signJwt({ sub: user.user_id, email: user.email });
    const exp = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // fallback exp mirror

    await usersModel.setJwt(user.user_id, { token, expiresAt: exp });

    return { user, token, expires_at: exp.toISOString() };
  }

  // For passwordless users, return user without token (they need to verify OTP)
  return { user, token: null, expires_at: null, requires_otp: true };
}

async function login({ email, password = null }) {
  const row = await usersModel.getUserByEmail(email);
  if (!row) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  // Check if user has password (admin users)
  if (row.password_hash) {
    // Admin user - password required
    if (!password) {
      const err = new Error('Password is required for this account');
      err.status = 400;
      throw err;
    }
    const ok = await bcrypt.compare(String(password), row.password_hash);
    if (!ok) {
      const err = new Error('Invalid password');
      err.status = 401;
      throw err;
    }
  } else {
    // Regular user - passwordless, use OTP flow
    if (password) {
      const err = new Error('This account does not use passwords. Please use OTP verification.');
      err.status = 400;
      throw err;
    }
    // For passwordless users, they should use OTP flow
    // Return error indicating OTP is required
    const err = new Error('This account requires OTP verification. Please use sendOtp and verifyOtp endpoints.');
    err.status = 403;
    err.requires_otp = true;
    throw err;
  }

  const token = signJwt({ sub: row.user_id, email: row.email });
  const exp = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  await usersModel.setJwt(row.user_id, { token, expiresAt: exp });
  await usersModel.setLastLogin(row.user_id);

  const user = await usersModel.getUserById(row.user_id);
  return { user, token, expires_at: exp.toISOString() };
}

async function logout(user_id) {
  await usersModel.clearJwt(user_id);
  return { success: true };
}

function generateOtp() {
  if (FIXED_TEST_OTP) {
    return FIXED_TEST_OTP;
  }
  return otpGenerator.generate(6, {
    digits: true,
    upperCaseAlphabets: false,
    lowerCaseAlphabets: false,
    specialChars: false,
  });
}

async function sendOtp({ user_id = null, email = null, phone = null, name = null, channel = 'sms', createIfNotExists = false, whatsapp_consent = false }) {
  // Resolve user if needed
  let user = null;
  if (user_id) {
    user = await usersModel.getUserById(user_id);
  } else if (email) {
    const row = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
    user = row.rows[0] || null;
  } else if (phone) {
    const row = await pool.query(`SELECT * FROM users WHERE phone = $1`, [phone]);
    user = row.rows[0] || null;
  }

  // Create user if not exists and createIfNotExists is true (for booking flow)
  if (!user && createIfNotExists) {
    if (!email && !phone) {
      const err = new Error('email or phone is required to create user');
      err.status = 400;
      throw err;
    }
    if (!name) {
      const err = new Error('name is required to create user');
      err.status = 400;
      throw err;
    }

    // register() returns { user, token, ... } — extract the inner user row
    const regResult = await register({ name, email, phone, whatsapp_consent });
    user = regResult.user || regResult;
    logger.info('Created new user via OTP flow', { user_id: user.user_id, email, phone });
  }

  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  const otp = FIXED_TEST_OTP || generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  await pool.query(
    `UPDATE users SET otp_code = $1, otp_expires_at = $2, updated_at = NOW() WHERE user_id = $3`,
    [otp, expiresAt, user.user_id]
  );

  // Determine the phone to send SMS to:
  // 1. Prefer the phone stored on the user record
  // 2. Fall back to the phone supplied in the request (for existing users who signed up with only email)
  const smsPhone = user.phone || phone || null;

  // If user has no phone saved yet but we have one from the request, persist it
  if (!user.phone && smsPhone) {
    await pool.query(
      `UPDATE users SET phone = $1, updated_at = NOW() WHERE user_id = $2`,
      [smsPhone, user.user_id]
    );
    user.phone = smsPhone;
    logger.info('Updated user phone from request', { user_id: user.user_id, phone: smsPhone });
  }

  // deliver
  if (!FIXED_TEST_OTP) {
    if (smsPhone) {
      logger.info('Sending OTP SMS', { phone: smsPhone });
      await sendSMS({ to: smsPhone, body: `Your SnowCity OTP is ${otp}. Valid for 10 minutes.` });
    } else if (channel === 'email' && user.email) {
      // Fallback: send to email if no phone available at all
      logger.info('No phone available, falling back to email OTP', { email: user.email });
      await sendMail({
        to: user.email,
        subject: 'Your SnowCity OTP',
        html: `<p>Your OTP is <b>${otp}</b>. It expires in 10 minutes.</p>`,
        text: `Your OTP is ${otp}. It expires in 10 minutes.`,
      });
    } else {
      logger.warn('sendOtp: No phone or email available to deliver OTP', {
        user_id: user.user_id,
        channel,
        hasEmail: !!user.email,
        hasPhone: !!smsPhone,
      });
    }
  } else {
    logger.info('FIXED_TEST_OTP active — skipping real SMS delivery', { otp: FIXED_TEST_OTP });
  }

  return { user_id: user.user_id, sent: true, channel, otp: FIXED_TEST_OTP ? otp : undefined };
}

async function verifyOtp({ user_id, otp, email = null, phone = null, name = null, whatsapp_consent = null }) {
  console.log('verifyOtp called with whatsapp_consent:', whatsapp_consent);
  // If user_id not provided, try to find user by email or phone
  let userId = user_id;
  if (!userId) {
    if (email) {
      const row = await pool.query(`SELECT user_id FROM users WHERE email = $1`, [email]);
      if (row.rows[0]) userId = row.rows[0].user_id;
    } else if (phone) {
      const row = await pool.query(`SELECT user_id FROM users WHERE phone = $1`, [phone]);
      if (row.rows[0]) userId = row.rows[0].user_id;
    }
  }

  if (!userId) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  const { rows } = await pool.query(
    `SELECT user_id, otp_code, otp_expires_at FROM users WHERE user_id = $1`,
    [userId]
  );
  const u = rows[0];
  if (!u || !u.otp_code || !u.otp_expires_at) {
    const err = new Error('OTP not requested');
    err.status = 400;
    throw err;
  }
  if (String(u.otp_code) !== String(otp)) {
    const err = new Error('Invalid OTP');
    err.status = 400;
    throw err;
  }
  if (new Date(u.otp_expires_at) < new Date()) {
    const err = new Error('OTP expired');
    err.status = 400;
    throw err;
  }

  // Verify OTP and generate token automatically
  await pool.query(
    `UPDATE users
     SET otp_verified = TRUE, otp_code = NULL, otp_expires_at = NULL, updated_at = NOW(), last_login_at = NOW()
     WHERE user_id = $1`,
    [userId]
  );

  // Update whatsapp_consent if provided
  if (whatsapp_consent !== null) {
    await pool.query(
      `UPDATE users SET whatsapp_consent = $1, updated_at = NOW() WHERE user_id = $2`,
      [whatsapp_consent, userId]
    );
  }

  // Add to Interakt if consented
  if (whatsapp_consent) {
    // Get user details for contact addition
    const userRes = await pool.query('SELECT name, email, phone FROM users WHERE user_id = $1', [userId]);
    const userDetails = userRes.rows[0];
    if (userDetails && userDetails.phone) {
      const { addContact } = require('../services/interaktService');
      const addResult = await addContact({
        phone: userDetails.phone,
        name: userDetails.name,
        email: userDetails.email,
        userId
      });
      if (addResult.success) {
        console.log('User added to Interakt contacts successfully');
      } else {
        console.log('Failed to add user to Interakt contacts:', addResult.reason);
      }
    } else {
      console.log('User phone not available for Interakt contact addition');
    }
  } else {
    console.log('User did not consent to WhatsApp');
  }

  // Get user details
  const user = await usersModel.getUserById(userId);

  // Generate JWT token automatically after OTP verification
  const token = signJwt({ sub: user.user_id, email: user.email });
  const exp = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days

  await usersModel.setJwt(user.user_id, { token, expiresAt: exp });

  return {
    verified: true,
    user,
    token,
    expires_at: exp.toISOString()
  };
}

async function forgotPassword({ email }) {
  // For demo: reuse OTP as reset code
  const { rows } = await pool.query(`SELECT user_id, email FROM users WHERE email = $1`, [email]);
  const u = rows[0];
  if (!u) return { sent: true }; // don't leak existence

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await pool.query(
    `UPDATE users SET otp_code = $1, otp_expires_at = $2, updated_at = NOW() WHERE user_id = $3`,
    [otp, expiresAt, u.user_id]
  );

  await sendMail({
    to: u.email,
    subject: 'SnowCity Password Reset Code',
    html: `<p>Your password reset code is <b>${otp}</b>. It expires in 10 minutes.</p>`,
    text: `Your password reset code is ${otp}. It expires in 10 minutes.`,
  });

  return { sent: true };
}

async function resetPassword({ email, code, newPassword }) {
  const { rows } = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
  const u = rows[0];
  if (!u) {
    const err = new Error('Invalid code or email');
    err.status = 400;
    throw err;
  }
  if (!u.otp_code || String(u.otp_code) !== String(code) || new Date(u.otp_expires_at) < new Date()) {
    const err = new Error('Invalid or expired reset code');
    err.status = 400;
    throw err;
  }

  const hash = await bcrypt.hash(String(newPassword), SALT_ROUNDS);
  await pool.query(
    `UPDATE users SET password_hash = $1, otp_code = NULL, otp_expires_at = NULL, updated_at = NOW() WHERE user_id = $2`,
    [hash, u.user_id]
  );

  return { reset: true };
}

module.exports = {
  register,
  login,
  logout,
  sendOtp,
  verifyOtp,
  forgotPassword,
  resetPassword,
};