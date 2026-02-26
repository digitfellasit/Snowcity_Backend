-- =============================================================
-- RBAC Roles Seed Migration — 4-Role System
-- SuperAdmin | GM | Staff | Editor
-- =============================================================

-- 1. Ensure core RBAC tables exist
CREATE TABLE IF NOT EXISTS roles (
  role_id   SERIAL PRIMARY KEY,
  role_name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
  permission_id  SERIAL PRIMARY KEY,
  permission_key VARCHAR(100) UNIQUE NOT NULL,
  description    TEXT,
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  id            SERIAL,
  role_id       INTEGER REFERENCES roles(role_id) ON DELETE CASCADE,
  permission_id INTEGER REFERENCES permissions(permission_id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id),
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_roles (
  id      SERIAL,
  user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
  role_id INTEGER REFERENCES roles(role_id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Ensure admin_access table exists with module_permissions column
CREATE TABLE IF NOT EXISTS admin_access (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  resource_type VARCHAR(50) NOT NULL,
  resource_id   BIGINT,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, resource_type, resource_id)
);

-- Add module_permissions column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_access'
      AND column_name = 'module_permissions'
  ) THEN
    ALTER TABLE admin_access
      ADD COLUMN module_permissions JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- 3. Create unique row for module-level permissions per user
--    We store module_permissions in a special row with resource_type='modules' and resource_id=0
-- (handled in application layer)

-- 4. Upsert the 4 canonical roles
INSERT INTO roles (role_name, description) VALUES
  ('superadmin', 'Super Administrator — full access including admin management'),
  ('gm',         'General Manager — full access except admin user creation'),
  ('staff',      'Staff — scoped to specific attraction(s) and their combos'),
  ('editor',     'Editor — catalog read/write only, no offers/coupons/dynamic pricing')
ON CONFLICT (role_name) DO UPDATE
  SET description = EXCLUDED.description,
      updated_at  = NOW();

-- Also keep legacy names as aliases (in case existing accounts use them)
INSERT INTO roles (role_name, description) VALUES
  ('root',     'Root — alias for superadmin'),
  ('admin',    'Admin — alias for gm'),
  ('subadmin', 'Sub-admin — legacy role')
ON CONFLICT (role_name) DO NOTHING;

-- 5. Upsert all permissions
INSERT INTO permissions (permission_key, description) VALUES
  -- Admin management
  ('admin-management:read',    'List admin users'),
  ('admin-management:write',   'Create admin users'),
  ('admin-management:manage',  'Full admin user management'),
  -- Roles & Permissions
  ('roles:read',               'Read roles'),
  ('roles:write',              'Create/Update roles'),
  ('permissions:read',         'Read permissions'),
  ('permissions:write',        'Create/Update permissions'),
  -- Users (public customers)
  ('users:read',               'Read customers'),
  ('users:write',              'Create/Update customers'),
  -- Attractions & Combos
  ('attractions:read',         'Read attractions'),
  ('attractions:write',        'Create/Update attractions'),
  ('combos:read',              'Read combos'),
  ('combos:write',             'Create/Update combos'),
  -- Slots
  ('slots:read',               'Read slots'),
  ('slots:write',              'Create/Update slots'),
  -- Add-ons
  ('addons:read',              'Read add-ons'),
  ('addons:write',             'Create/Update add-ons'),
  -- Offers
  ('offers:read',              'Read offers'),
  ('offers:write',             'Create/Update offers'),
  -- Dynamic Pricing
  ('dynamic_pricing:read',     'Read dynamic pricing'),
  ('dynamic_pricing:write',    'Create/Update dynamic pricing'),
  -- Coupons
  ('coupons:read',             'Read coupons'),
  ('coupons:write',            'Create/Update coupons'),
  -- Banners
  ('banners:read',             'Read banners'),
  ('banners:write',            'Create/Update banners'),
  -- Gallery
  ('gallery:read',             'Read gallery'),
  ('gallery:write',            'Create/Update gallery'),
  -- Pages & Blogs
  ('pages:read',               'Read CMS pages'),
  ('pages:write',              'Create/Update CMS pages'),
  ('blogs:read',               'Read blogs'),
  ('blogs:write',              'Create/Update blogs'),
  -- Bookings
  ('bookings:read',            'Read bookings'),
  ('bookings:write',           'Update/manage bookings'),
  -- Analytics & Dashboard
  ('analytics:read',           'Read analytics & reports'),
  ('dashboard:read',           'View dashboard'),
  -- Notifications & Holidays
  ('notifications:read',       'Read notifications'),
  ('notifications:write',      'Manage notifications'),
  ('holidays:read',            'Read holidays'),
  ('holidays:write',           'Create/Update holidays'),
  -- Revenue
  ('revenue:read',             'Read revenue reports'),
  ('conversion:read',          'Read conversion data'),
  -- Settings
  ('settings:read',            'Read site settings'),
  ('settings:write',           'Update site settings'),
  -- Uploads
  ('uploads:write',            'Upload files')
ON CONFLICT (permission_key) DO UPDATE
  SET description = EXCLUDED.description,
      updated_at  = NOW();

-- 6. Clear existing role_permissions for our 4 roles to re-seed cleanly
DELETE FROM role_permissions
WHERE role_id IN (
  SELECT role_id FROM roles
  WHERE role_name IN ('superadmin', 'gm', 'staff', 'editor')
);

-- 7. SuperAdmin — ALL permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r CROSS JOIN permissions p
WHERE r.role_name = 'superadmin'
ON CONFLICT DO NOTHING;

-- 8. GM — Everything EXCEPT admin-management:write/manage, roles:write, permissions:write
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
ON CONFLICT DO NOTHING;

-- 9. Staff — scoped analytics, bookings, attractions, combos, offers, dynamic pricing
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r CROSS JOIN permissions p
WHERE r.role_name = 'staff'
  AND p.permission_key IN (
    'dashboard:read',
    'analytics:read',
    'bookings:read',
    'bookings:write',
    'attractions:read',
    'combos:read',
    'offers:read',
    'offers:write',
    'dynamic_pricing:read',
    'dynamic_pricing:write',
    'uploads:write'
  )
ON CONFLICT DO NOTHING;

-- 10. Editor — Catalog only (NO offers / coupons / dynamic pricing)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r CROSS JOIN permissions p
WHERE r.role_name = 'editor'
  AND p.permission_key IN (
    'dashboard:read',
    'attractions:read',
    'attractions:write',
    'combos:read',
    'combos:write',
    'addons:read',
    'addons:write',
    'slots:read',
    'slots:write',
    'banners:read',
    'banners:write',
    'gallery:read',
    'gallery:write',
    'pages:read',
    'pages:write',
    'blogs:read',
    'blogs:write',
    'uploads:write'
  )
ON CONFLICT DO NOTHING;

-- 11. Also give legacy 'root' and 'admin' same perms as superadmin/gm
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r CROSS JOIN permissions p
WHERE r.role_name = 'root'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r CROSS JOIN permissions p
WHERE r.role_name = 'admin'
  AND p.permission_key NOT IN (
    'admin-management:write',
    'admin-management:manage'
  )
ON CONFLICT DO NOTHING;

-- 12. Assign superadmin role to user_id=1 (primary super admin)
INSERT INTO user_roles (user_id, role_id)
SELECT 1, r.role_id
FROM roles r
WHERE r.role_name = 'superadmin'
ON CONFLICT DO NOTHING;

-- 13. Make sure user_id=1 also has the 'root' role (backward compat)
INSERT INTO user_roles (user_id, role_id)
SELECT 1, r.role_id
FROM roles r
WHERE r.role_name = 'root'
ON CONFLICT DO NOTHING;

-- Done
-- ============================================================
