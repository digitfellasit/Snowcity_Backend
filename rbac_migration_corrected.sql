-- RBAC Migration: Corrected version
-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
  role_id SERIAL PRIMARY KEY,
  role_name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create permissions table
CREATE TABLE IF NOT EXISTS permissions (
  permission_id SERIAL PRIMARY KEY,
  permission_key VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create role_permissions junction table
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INTEGER REFERENCES roles(role_id) ON DELETE CASCADE,
  permission_id INTEGER REFERENCES permissions(permission_id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create user_roles junction table
CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER REFERENCES users(user_id) ON DELETE CASCADE,
  role_id INTEGER REFERENCES roles(role_id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES roles(role_id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS attraction_id INTEGER REFERENCES attractions(attraction_id);

-- Insert default roles
INSERT INTO roles (role_name, description) VALUES
  ('super_admin', 'Super Administrator with full access'),
  ('gm', 'General Manager'),
  ('staff', 'Staff member limited to specific attraction'),
  ('editor', 'Editor with catalog access'),
  ('subadmin', 'Sub-admin with limited permissions')
ON CONFLICT (role_name) DO NOTHING;

-- Insert default permissions
INSERT INTO permissions (permission_key, description) VALUES
  ('admin-management:read', 'Read admin users'),
  ('admin-management:write', 'Create/Update admin users'),
  ('admin-management:manage', 'Manage admin users'),
  ('roles:read', 'Read roles'),
  ('roles:write', 'Create/Update roles'),
  ('permissions:read', 'Read permissions'),
  ('permissions:write', 'Create/Update permissions'),
  ('users:read', 'Read users'),
  ('users:write', 'Create/Update users'),
  ('attractions:read', 'Read attractions'),
  ('attractions:write', 'Create/Update attractions'),
  ('combos:read', 'Read combos'),
  ('combos:write', 'Create/Update combos'),
  ('addons:read', 'Read addons'),
  ('addons:write', 'Create/Update addons'),
  ('offers:read', 'Read offers'),
  ('offers:write', 'Create/Update offers'),
  ('coupons:read', 'Read coupons'),
  ('coupons:write', 'Create/Update coupons'),
  ('banners:read', 'Read banners'),
  ('banners:write', 'Create/Update banners'),
  ('blogs:read', 'Read blogs'),
  ('blogs:write', 'Create/Update blogs'),
  ('gallery:read', 'Read gallery'),
  ('gallery:write', 'Create/Update gallery'),
  ('pages:read', 'Read pages'),
  ('pages:write', 'Create/Update pages'),
  ('slots:read', 'Read slots'),
  ('slots:write', 'Create/Update slots'),
  ('bookings:read', 'Read bookings'),
  ('bookings:write', 'Create/Update bookings'),
  ('analytics:read', 'Read analytics'),
  ('notifications:read', 'Read notifications'),
  ('notifications:write', 'Create/Update notifications'),
  ('holidays:read', 'Read holidays'),
  ('holidays:write', 'Create/Update holidays'),
  ('conversion:read', 'Read conversion data'),
  ('dynamic_pricing:read', 'Read dynamic pricing'),
  ('dynamic_pricing:write', 'Create/Update dynamic pricing'),
  ('settings:read', 'Read settings'),
  ('settings:write', 'Create/Update settings'),
  ('catalogs:read', 'Read catalogs'),
  ('catalogs:write', 'Create/Update catalogs'),
  ('uploads:write', 'Upload files')
ON CONFLICT (permission_key) DO NOTHING;

-- Assign permissions to roles
-- Super Admin gets all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_name = 'super_admin'
ON CONFLICT DO NOTHING;

-- GM gets most permissions except admin management
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_name = 'gm'
  AND p.permission_key NOT LIKE 'admin-management:%'
  AND p.permission_key NOT LIKE 'roles:%'
  AND p.permission_key NOT LIKE 'permissions:%'
ON CONFLICT DO NOTHING;

-- Staff gets limited permissions for their attraction
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_name = 'staff'
  AND p.permission_key IN ('attractions:read', 'combos:read', 'offers:read', 'coupons:read', 'bookings:read', 'analytics:read')
ON CONFLICT DO NOTHING;

-- Editor gets catalog permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_name = 'editor'
  AND p.permission_key LIKE 'catalogs:%'
ON CONFLICT DO NOTHING;

-- Subadmin gets some permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_name = 'subadmin'
  AND p.permission_key IN ('users:read', 'bookings:read', 'analytics:read')
ON CONFLICT DO NOTHING;

-- Assign super_admin role to user_id=1
INSERT INTO user_roles (user_id, role_id)
SELECT 1, r.role_id
FROM roles r
WHERE r.role_name = 'super_admin'
ON CONFLICT DO NOTHING;

-- Update legacy role_id column for backward compatibility
UPDATE users SET role_id = ur.role_id
FROM user_roles ur
WHERE users.user_id = ur.user_id
  AND users.role_id IS NULL;
