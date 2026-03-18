// admin/controllers/admins.controller.js
const bcrypt = require('bcryptjs');
const { pool, withTransaction } = require('../../config/db');
const adminModel = require('../models/admin.model');
const { loadUserScopes } = require('../../middlewares/authMiddleware');

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);

// Roles that can be assigned to new admins (not superadmin — that's protected)
const ASSIGNABLE_ROLES = ['gm', 'staff', 'editor', 'subadmin', 'admin'];

exports.listAdmins = async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const role = req.query.role ? String(req.query.role).toLowerCase() : null;
    const limit = Math.min(Math.max(parseInt(req.query.limit || '50', 10), 1), 200);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);

    const rows = await adminModel.listAdmins({ search, role, limit, offset });
    res.json(rows);
  } catch (err) { next(err); }
};

exports.createAdmin = async (req, res, next) => {
  try {
    const { name, email, password, phone = null, roles = ['staff'] } = req.body || {};
    if (!name || !email || !password)
      return res.status(400).json({ error: 'name, email, password are required' });

    // Prevent non-superadmin from creating superadmin accounts
    const assignedRoles = (Array.isArray(roles) ? roles : [roles])
      .map((r) => String(r).toLowerCase())
      .filter((r) => ASSIGNABLE_ROLES.includes(r) || r === 'superadmin');

    const hash = await bcrypt.hash(String(password), SALT_ROUNDS);

    const user = await withTransaction(async (client) => {
      const ins = await client.query(
        `INSERT INTO users (name, email, phone, password_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING user_id, name, email, phone, created_at, updated_at`,
        [name.trim(), email.trim(), phone || null, hash]
      );
      const u = ins.rows[0];

      // Ensure roles exist and assign
      const normalized = assignedRoles.length ? assignedRoles : ['staff'];
      const existing = await client.query(
        `SELECT role_id, LOWER(role_name) AS role_name FROM roles WHERE LOWER(role_name) = ANY($1::text[])`,
        [normalized]
      );
      const map = new Map(existing.rows.map((r) => [r.role_name, r.role_id]));
      for (const r of normalized) {
        if (!map.has(r)) {
          const insRole = await client.query(
            `INSERT INTO roles (role_name, description) VALUES ($1, $2) RETURNING role_id`,
            [r, `${r} role`]
          );
          map.set(r, insRole.rows[0].role_id);
        }
      }
      for (const rid of map.values()) {
        await client.query(
          `INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [u.user_id, rid]
        );
      }
      return u;
    });

    res.status(201).json(user);
  } catch (err) {
    if (err?.code === '23505') return res.status(409).json({ error: 'Email or phone already exists' });
    next(err);
  }
};

/**
 * GET /api/admin/admins/:id/access
 * Returns resource-level access + module_permissions for the admin
 */
exports.getAccess = async (req, res, next) => {
  try {
    const userId = Number(req.params.id);

    // Load regular resource access
    const { rows } = await pool.query(
      `SELECT resource_type, resource_id, module_permissions
       FROM admin_access
       WHERE user_id = $1
       ORDER BY resource_type, resource_id`,
      [userId]
    );

    const access = {};
    let module_permissions = [];

    for (const row of rows) {
      const rt = row.resource_type;
      if (rt === 'modules') {
        module_permissions = Array.isArray(row.module_permissions)
          ? row.module_permissions
          : [];
        continue;
      }
      if (!access[rt]) access[rt] = [];
      if (row.resource_id !== null && row.resource_id !== -1) {
        access[rt].push(Number(row.resource_id));
      } else {
        access[rt] = ['*']; // full module token
      }
    }

    res.json({ user_id: userId, access, module_permissions });
  } catch (err) { next(err); }
};

/**
 * PUT /api/admin/admins/:id/access
 * Saves resource-level access + module_permissions for the admin
 * Body: { access: { attraction: [...], combo: [...], ... }, module_permissions: ['analytics', 'bookings', ...] }
 */
exports.setAccess = async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    const payload = req.body?.access || req.body || {};
    const module_permissions = Array.isArray(req.body?.module_permissions)
      ? req.body.module_permissions
      : [];
    const allowedTypes = ['attraction', 'combo', 'banner', 'page', 'blog', 'gallery'];

    await withTransaction(async (client) => {
      // Clear all existing access for this user
      const types = allowedTypes.filter((t) => Array.isArray(payload[t]));
      if (types.length) {
        await client.query(
          `DELETE FROM admin_access WHERE user_id = $1 AND resource_type = ANY($2::text[])`,
          [userId, types]
        );
      }

      for (const t of types) {
        const vals = payload[t];
        // Check for '*' (full module access) — store as resource_id = -1
        if (vals.includes('*')) {
          await client.query(
            `INSERT INTO admin_access (user_id, resource_type, resource_id)
             VALUES ($1, $2, -1)
             ON CONFLICT (user_id, resource_type, resource_id) DO NOTHING`,
            [userId, t]
          );
        } else {
          const ids = [...new Set(vals.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0))];
          for (const id of ids) {
            await client.query(
              `INSERT INTO admin_access (user_id, resource_type, resource_id)
               VALUES ($1, $2, $3)
               ON CONFLICT (user_id, resource_type, resource_id) DO NOTHING`,
              [userId, t, id]
            );
          }
        }
      }

      // Save module_permissions in special 'modules' row
      await client.query(
        `DELETE FROM admin_access WHERE user_id = $1 AND resource_type = 'modules'`,
        [userId]
      );
      if (module_permissions.length) {
        await client.query(
          `INSERT INTO admin_access (user_id, resource_type, resource_id, module_permissions)
           VALUES ($1, 'modules', 0, $2::jsonb)
           ON CONFLICT (user_id, resource_type, resource_id)
           DO UPDATE SET module_permissions = EXCLUDED.module_permissions, updated_at = NOW()`,
          [userId, JSON.stringify(module_permissions)]
        );
      }
    });

    res.json({ user_id: userId, access: payload, module_permissions });
  } catch (err) { next(err); }
};

/**
 * GET /api/admin/me
 * Returns current admin's profile, roles, permissions, and scopes
 */
exports.getMe = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [userRes, rolesRes, permsRes, scopes] = await Promise.all([
      pool.query(
        `SELECT user_id, name, email, phone, created_at FROM users WHERE user_id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT LOWER(r.role_name) AS role_name
         FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
         WHERE ur.user_id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT DISTINCT LOWER(p.permission_key) AS permission_key
         FROM user_roles ur
         JOIN role_permissions rp ON rp.role_id = ur.role_id
         JOIN permissions p ON p.permission_id = rp.permission_id
         WHERE ur.user_id = $1`,
        [userId]
      ),
      loadUserScopes(userId),
    ]);

    const user = userRes.rows[0];
    const roles = rolesRes.rows.map((r) => r.role_name);
    const perms = permsRes.rows.map((r) => r.permission_key);

    const isSuperAdmin = roles.includes('superadmin') || roles.includes('root');

    res.json({
      user_id: user.user_id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      created_at: user.created_at,
      roles,
      perms,
      scopes: isSuperAdmin ? null : scopes, // superadmin has no scopes (full access)
      is_super_admin: isSuperAdmin,
    });
  } catch (err) { next(err); }
};
/**
 * DELETE /api/admin/admins/:id
 * Deletes an admin user
 */
exports.deleteAdmin = async (req, res, next) => {
  try {
    const targetId = Number(req.params.id);
    const requesterId = Number(req.user.id);

    // 1. Prevent self-deletion
    if (targetId === requesterId) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    // 2. Check if requester is superadmin/root
    const roles = req.user.roles || [];
    const isSuper = roles.includes('superadmin') || roles.includes('root');
    if (!isSuper) {
      return res.status(403).json({ error: 'Only superadmins can delete other admins' });
    }

    // 3. Prevent deleting the root user (ID 1 usually)
    if (targetId === 1) {
      return res.status(403).json({ error: 'The root administrator cannot be deleted' });
    }

    await withTransaction(async (client) => {
      // Check if user exists
      const { rows } = await client.query(
        `SELECT user_id FROM users WHERE user_id = $1`,
        [targetId]
      );

      if (rows.length === 0) {
        throw Object.assign(new Error('Admin not found'), { status: 404 });
      }

      // Delete from users table (cascades to user_roles and admin_access)
      await client.query(`DELETE FROM users WHERE user_id = $1`, [targetId]);
    });

    res.json({ success: true, message: 'Admin deleted successfully' });
  } catch (err) {
    next(err);
  }
};
