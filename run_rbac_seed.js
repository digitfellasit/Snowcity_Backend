// run_rbac_seed.js — runs the RBAC roles seed migration
require('dotenv').config();
const { pool } = require('./config/db');

async function main() {
  console.log('Running RBAC seed migration...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Create tables if needed
    console.log('  Creating tables...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS roles (
        role_id   SERIAL PRIMARY KEY,
        role_name VARCHAR(50) UNIQUE NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS permissions (
        permission_id  SERIAL PRIMARY KEY,
        permission_key VARCHAR(100) UNIQUE NOT NULL,
        description    TEXT,
        created_at     TIMESTAMP DEFAULT NOW(),
        updated_at     TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        id            SERIAL,
        role_id       INTEGER REFERENCES roles(role_id) ON DELETE CASCADE,
        permission_id INTEGER REFERENCES permissions(permission_id) ON DELETE CASCADE,
        PRIMARY KEY (role_id, permission_id),
        created_at    TIMESTAMP DEFAULT NOW(),
        updated_at    TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_roles (
        id      SERIAL,
        user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
        role_id INTEGER REFERENCES roles(role_id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, role_id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_access (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        resource_type VARCHAR(50) NOT NULL,
        resource_id   BIGINT,
        created_at    TIMESTAMP DEFAULT NOW(),
        updated_at    TIMESTAMP DEFAULT NOW(),
        UNIQUE (user_id, resource_type, resource_id)
      )
    `);

    // Add module_permissions column if missing
    await client.query(`
      ALTER TABLE admin_access
        ADD COLUMN IF NOT EXISTS module_permissions JSONB DEFAULT '[]'::jsonb
    `);

    // 2. Upsert 4 main roles
    console.log('  Upserting roles...');
    const roles4 = [
      ['superadmin', 'Super Administrator — full access including admin management'],
      ['gm', 'General Manager — full access except admin user creation'],
      ['staff', 'Staff — scoped to specific attraction(s) and their combos'],
      ['editor', 'Editor — catalog read/write only, no offers/coupons/dynamic pricing'],
    ];
    for (const [rn, rd] of roles4) {
      await client.query(
        `INSERT INTO roles (role_name, description)
         VALUES ($1, $2)
         ON CONFLICT (role_name) DO UPDATE SET description=$2, updated_at=NOW()`,
        [rn, rd]
      );
    }
    // Legacy aliases
    const legacy = [
      ['root', 'Root — alias for superadmin'],
      ['admin', 'Admin — alias for gm'],
      ['subadmin', 'Sub-admin — legacy role'],
    ];
    for (const [rn, rd] of legacy) {
      await client.query(
        `INSERT INTO roles (role_name, description) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [rn, rd]
      );
    }

    // 3. Upsert permissions
    console.log('  Upserting permissions...');
    const perms = [
      ['admin-management:read', 'List admin users'],
      ['admin-management:write', 'Create admin users'],
      ['admin-management:manage', 'Full admin user management'],
      ['roles:read', 'Read roles'],
      ['roles:write', 'Create/Update roles'],
      ['permissions:read', 'Read permissions'],
      ['permissions:write', 'Create/Update permissions'],
      ['users:read', 'Read customers'],
      ['users:write', 'Create/Update customers'],
      ['attractions:read', 'Read attractions'],
      ['attractions:write', 'Create/Update attractions'],
      ['combos:read', 'Read combos'],
      ['combos:write', 'Create/Update combos'],
      ['slots:read', 'Read slots'],
      ['slots:write', 'Create/Update slots'],
      ['addons:read', 'Read add-ons'],
      ['addons:write', 'Create/Update add-ons'],
      ['offers:read', 'Read offers'],
      ['offers:write', 'Create/Update offers'],
      ['dynamic_pricing:read', 'Read dynamic pricing'],
      ['dynamic_pricing:write', 'Create/Update dynamic pricing'],
      ['coupons:read', 'Read coupons'],
      ['coupons:write', 'Create/Update coupons'],
      ['banners:read', 'Read banners'],
      ['banners:write', 'Create/Update banners'],
      ['gallery:read', 'Read gallery'],
      ['gallery:write', 'Create/Update gallery'],
      ['pages:read', 'Read CMS pages'],
      ['pages:write', 'Create/Update CMS pages'],
      ['blogs:read', 'Read blogs'],
      ['blogs:write', 'Create/Update blogs'],
      ['bookings:read', 'Read bookings'],
      ['bookings:write', 'Update/manage bookings'],
      ['analytics:read', 'Read analytics & reports'],
      ['dashboard:read', 'View dashboard'],
      ['notifications:read', 'Read notifications'],
      ['notifications:write', 'Manage notifications'],
      ['holidays:read', 'Read holidays'],
      ['holidays:write', 'Create/Update holidays'],
      ['revenue:read', 'Read revenue reports'],
      ['conversion:read', 'Read conversion data'],
      ['settings:read', 'Read site settings'],
      ['settings:write', 'Update site settings'],
      ['uploads:write', 'Upload files'],
    ];
    for (const [pk, desc] of perms) {
      await client.query(
        `INSERT INTO permissions (permission_key, description)
         VALUES ($1,$2)
         ON CONFLICT (permission_key) DO UPDATE SET description=$2, updated_at=NOW()`,
        [pk, desc]
      );
    }

    // 4. Clear and re-seed role_permissions for 4 main roles
    console.log('  Seeding role permissions...');
    await client.query(
      `DELETE FROM role_permissions
       WHERE role_id IN (SELECT role_id FROM roles WHERE role_name IN ('superadmin','gm','staff','editor'))`
    );

    // SuperAdmin — all
    await client.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.role_id, p.permission_id
      FROM roles r CROSS JOIN permissions p
      WHERE r.role_name = 'superadmin'
      ON CONFLICT DO NOTHING
    `);

    // GM — all except create/manage admins, roles:write, permissions:write
    await client.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.role_id, p.permission_id
      FROM roles r CROSS JOIN permissions p
      WHERE r.role_name = 'gm'
        AND p.permission_key NOT IN (
          'admin-management:write',
          'admin-management:manage',
          'roles:write',
          'permissions:write'
        )
      ON CONFLICT DO NOTHING
    `);

    // Staff — scoped analytics, bookings, attractions, combos, offers, dynamic pricing
    const staffPerms = [
      'dashboard:read', 'analytics:read',
      'bookings:read', 'bookings:write',
      'attractions:read', 'combos:read',
      'offers:read', 'offers:write',
      'dynamic_pricing:read', 'dynamic_pricing:write',
      'uploads:write'
    ];
    await client.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.role_id, p.permission_id
      FROM roles r CROSS JOIN permissions p
      WHERE r.role_name = 'staff'
        AND p.permission_key = ANY($1::text[])
      ON CONFLICT DO NOTHING
    `, [staffPerms]);

    // Editor — catalog only, no offers/coupons/dynamic pricing
    const editorPerms = [
      'dashboard:read',
      'attractions:read', 'attractions:write',
      'combos:read', 'combos:write',
      'addons:read', 'addons:write',
      'slots:read', 'slots:write',
      'banners:read', 'banners:write',
      'gallery:read', 'gallery:write',
      'pages:read', 'pages:write',
      'blogs:read', 'blogs:write',
      'uploads:write'
    ];
    await client.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.role_id, p.permission_id
      FROM roles r CROSS JOIN permissions p
      WHERE r.role_name = 'editor'
        AND p.permission_key = ANY($1::text[])
      ON CONFLICT DO NOTHING
    `, [editorPerms]);

    // Give legacy root same perms as superadmin
    await client.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.role_id, p.permission_id
      FROM roles r CROSS JOIN permissions p
      WHERE r.role_name = 'root'
      ON CONFLICT DO NOTHING
    `);

    // 5. Assign superadmin + root to user_id=1 if that user exists
    console.log('  Assigning superadmin to user_id=1...');
    const userCheck = await client.query('SELECT user_id FROM users WHERE user_id = 1');
    if (userCheck.rows.length > 0) {
      await client.query(`
        INSERT INTO user_roles (user_id, role_id)
        SELECT 1, role_id FROM roles WHERE role_name IN ('superadmin','root')
        ON CONFLICT DO NOTHING
      `);
      console.log('  ✓ Assigned superadmin to user_id=1');
    } else {
      console.log('  ⚠ user_id=1 not found — skipping superadmin assignment');
      // Try to find the first admin user and assign superadmin
      const firstAdmin = await client.query(
        `SELECT u.user_id FROM users u
         JOIN user_roles ur ON ur.user_id = u.user_id
         JOIN roles r ON r.role_id = ur.role_id
         WHERE LOWER(r.role_name) IN ('admin','root','superadmin')
         ORDER BY u.user_id LIMIT 1`
      );
      if (firstAdmin.rows.length > 0) {
        const uid = firstAdmin.rows[0].user_id;
        await client.query(`
          INSERT INTO user_roles (user_id, role_id)
          SELECT $1, role_id FROM roles WHERE role_name IN ('superadmin','root')
          ON CONFLICT DO NOTHING
        `, [uid]);
        console.log(`  ✓ Assigned superadmin to user_id=${uid} (first existing admin)`);
      }
    }

    await client.query('COMMIT');

    // Verify
    const rolesRes = await pool.query('SELECT role_name FROM roles ORDER BY role_name');
    console.log('\nRoles in DB:', rolesRes.rows.map(r => r.role_name).join(', '));

    const rp = await pool.query(`
      SELECT r.role_name, COUNT(rp.permission_id) AS cnt
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_id = r.role_id
      GROUP BY r.role_name ORDER BY r.role_name
    `);
    console.log('\nPermissions per role:');
    rp.rows.forEach(r => console.log(`  - ${r.role_name}: ${r.cnt} perms`));

    console.log('\n✅ RBAC migration complete!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
