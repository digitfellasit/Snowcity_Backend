-- Revert RBAC migration changes
-- Remove columns from users table
ALTER TABLE users DROP COLUMN IF EXISTS role_id;
ALTER TABLE users DROP COLUMN IF EXISTS attraction_id;

-- Drop tables if they exist, with CASCADE to drop dependencies
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
