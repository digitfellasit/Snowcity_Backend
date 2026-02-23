const { pool, withTransaction } = require('../config/db');
const bcrypt = require('bcryptjs');
const logger = require('../config/logger');

const ALL_PERMISSION_KEYS = [
    'users:read', 'users:write',
    'roles:read', 'roles:write',
    'permissions:read', 'permissions:write',
    'settings:read', 'settings:write',
    'notifications:read', 'notifications:write',
    'holidays:read', 'holidays:write',
    'happyhours:read', 'happyhours:write',
    'attractions:read', 'attractions:write',
    'slots:read', 'slots:write',
    'bookings:read', 'bookings:write',
    'addons:read', 'addons:write',
    'combos:read', 'combos:write',
    'coupons:read', 'coupons:write',
    'offers:read', 'offers:write',
    'banners:read', 'banners:write',
    'pages:read', 'pages:write',
    'blogs:read', 'blogs:write',
    'gallery:read', 'gallery:write',
    'admin-management:read', 'admin-management:write',
    'dashboard:read',
    'analytics:read',
];

const MODULE_RESOURCES = ['attraction', 'combo', 'banner', 'page', 'blog', 'gallery'];
const MODULE_ALL_PREFIX = '__module_all__';

async function initializeSystem() {
    logger.info('Starting System Initialization...');
    try {
        await withTransaction(async (client) => {
            // 1. Ensure Roles exist
            const superAdminRoleId = await ensureRole(client, 'superadmin', 'Super Administrator with full access');
            await ensureRole(client, 'admin', 'Standard administrator');
            await ensureRole(client, 'user', 'Regular website user');

            // 2. Ensure Permissions exist
            for (const key of ALL_PERMISSION_KEYS) {
                await ensurePermission(client, key);
            }

            // 3. Grant all permissions to superadmin role
            await client.query(`
                INSERT INTO role_permissions (role_id, permission_id)
                SELECT $1, permission_id 
                FROM permissions
                ON CONFLICT (role_id, permission_id) DO NOTHING
            `, [superAdminRoleId]);

            // 4. Ensure Super Admin User exists
            const email = process.env.ROOT_ADMIN_EMAIL || 'Snowcity@gmail.com';
            const name = process.env.ROOT_ADMIN_NAME || 'Root Admin';
            const password = process.env.ROOT_ADMIN_PASSWORD || 'Snowcity@123';

            let userId;
            const userRes = await client.query('SELECT user_id FROM users WHERE email = $1', [email]);
            if (userRes.rows[0]) {
                userId = userRes.rows[0].user_id;
                logger.info('Super Admin user already exists.');
            } else {
                const salt = await bcrypt.genSalt(10);
                const hash = await bcrypt.hash(password, salt);
                const insRes = await client.query(
                    `INSERT INTO users (name, email, password_hash, otp_verified) 
                     VALUES ($1, $2, $3, TRUE) 
                     RETURNING user_id`,
                    [name, email, hash]
                );
                userId = insRes.rows[0].user_id;
                logger.info('Created new Super Admin user.');
            }

            // 5. Assign superadmin role to user
            await client.query(
                `INSERT INTO user_roles (user_id, role_id) 
                 VALUES ($1, $2) 
                 ON CONFLICT (user_id, role_id) DO NOTHING`,
                [userId, superAdminRoleId]
            );

            // 6. Grant full module access (resource-level) to Super Admin
            for (const type of MODULE_RESOURCES) {
                await client.query(
                    `INSERT INTO admin_access (user_id, resource_type, resource_id)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (user_id, resource_type, resource_id) DO NOTHING`,
                    [userId, type, 0] // 0 is often used as a dummy for full access when handled via prefix logic, 
                    // but our middleware looks for MODULE_ALL_PREFIX specifically if it's a string.
                    // However, attachScopes explicitly grants '*' to 'superadmin' role, 
                    // so this is just a backup safety.
                );
            }
        });
        logger.info('✅ Super Admin initialization complete.');
    } catch (err) {
        logger.error('❌ Super Admin initialization failed', { error: err.message });
        // Don't throw, allow server to start but log failure
    }
}

async function ensureRole(client, name, description) {
    const roleName = name.toLowerCase();
    const res = await client.query(
        `INSERT INTO roles (role_name, description) 
         VALUES ($1, $2) 
         ON CONFLICT (role_name) DO UPDATE SET description = EXCLUDED.description
         RETURNING role_id`,
        [roleName, description]
    );
    return res.rows[0].role_id;
}

async function ensurePermission(client, key) {
    await client.query(
        `INSERT INTO permissions (permission_key, description) 
         VALUES ($1, $2) 
         ON CONFLICT (permission_key) DO NOTHING`,
        [key.toLowerCase(), `${key} permission`]
    );
}

module.exports = { initializeSystem };
