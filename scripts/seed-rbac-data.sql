-- RBAC Seed Data for Healthcare Practice Management System
-- Run this script to populate initial permissions, roles, and sample organizations

-- Insert base permissions
INSERT INTO permissions (name, description, resource, action, scope, is_active) VALUES
-- User Management Permissions
('users:read:own', 'Read own user profile', 'users', 'read', 'own', true),
('users:update:own', 'Update own user profile', 'users', 'update', 'own', true),
('users:read:organization', 'Read users in organization', 'users', 'read', 'organization', true),
('users:create:organization', 'Create users in organization', 'users', 'create', 'organization', true),
('users:update:organization', 'Update users in organization', 'users', 'update', 'organization', true),
('users:delete:organization', 'Delete users in organization', 'users', 'delete', 'organization', true),
('users:read:all', 'Read all users (super admin)', 'users', 'read', 'all', true),
('users:manage:all', 'Full user management (super admin)', 'users', 'manage', 'all', true),

-- Practice/Organization Management Permissions
('practices:read:own', 'Read own practice information', 'practices', 'read', 'own', true),
('practices:update:own', 'Update own practice information', 'practices', 'update', 'own', true),
('practices:staff:manage:own', 'Manage practice staff', 'practices', 'staff:manage', 'own', true),
('practices:create:all', 'Create new practices (super admin)', 'practices', 'create', 'all', true),
('practices:read:all', 'Read all practices (super admin)', 'practices', 'read', 'all', true),
('practices:manage:all', 'Full practice management (super admin)', 'practices', 'manage', 'all', true),

-- Analytics & Reporting Permissions
('analytics:read:organization', 'View organization analytics', 'analytics', 'read', 'organization', true),
('analytics:export:organization', 'Export organization reports', 'analytics', 'export', 'organization', true),
('analytics:read:all', 'View all analytics (super admin)', 'analytics', 'read', 'all', true),

-- Role Management Permissions
('roles:read:organization', 'Read roles in organization', 'roles', 'read', 'organization', true),
('roles:create:organization', 'Create roles in organization', 'roles', 'create', 'organization', true),
('roles:update:organization', 'Update roles in organization', 'roles', 'update', 'organization', true),
('roles:delete:organization', 'Delete roles in organization', 'roles', 'delete', 'organization', true),
('roles:manage:all', 'Full role management (super admin)', 'roles', 'manage', 'all', true),

-- Settings & Configuration Permissions
('settings:read:organization', 'Read organization settings', 'settings', 'read', 'organization', true),
('settings:update:organization', 'Update organization settings', 'settings', 'update', 'organization', true),
('settings:read:all', 'Read all system settings', 'settings', 'read', 'all', true),
('settings:update:all', 'Update all system settings', 'settings', 'update', 'all', true),

-- Template Management Permissions
('templates:read:organization', 'Read available templates', 'templates', 'read', 'organization', true),
('templates:manage:all', 'Full template management (super admin)', 'templates', 'manage', 'all', true),

-- API Access Permissions
('api:read:organization', 'Read API access for organization', 'api', 'read', 'organization', true),
('api:write:organization', 'Write API access for organization', 'api', 'write', 'organization', true);

-- Insert base roles
INSERT INTO roles (name, description, is_system_role, is_active) VALUES
('super_admin', 'Super administrator with full system access', true, true),
('practice_admin', 'Practice administrator with full practice management', false, true),
('practice_manager', 'Practice manager with staff and operational management', false, true),
('practice_staff', 'Practice staff member with basic access', false, true),
('practice_user', 'Basic practice user with minimal access', false, true);

-- Insert sample organizations
INSERT INTO organizations (name, slug, is_active) VALUES
('Platform Administration', 'platform-admin', true),
('Rheumatology Associates', 'rheumatology-associates', true),
('Joint Care Specialists', 'joint-care-specialists', true);

-- Assign permissions to super_admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'super_admin'
  AND p.name IN (
    'users:read:all',
    'users:manage:all',
    'practices:create:all',
    'practices:read:all',
    'practices:manage:all',
    'analytics:read:all',
    'roles:manage:all',
    'settings:read:all',
    'settings:update:all',
    'templates:manage:all'
  );

-- Assign permissions to practice_admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'practice_admin'
  AND p.name IN (
    'users:read:own',
    'users:update:own',
    'users:read:organization',
    'users:create:organization',
    'users:update:organization',
    'users:delete:organization',
    'practices:read:own',
    'practices:update:own',
    'practices:staff:manage:own',
    'analytics:read:organization',
    'analytics:export:organization',
    'roles:read:organization',
    'roles:create:organization',
    'roles:update:organization',
    'roles:delete:organization',
    'settings:read:organization',
    'settings:update:organization',
    'templates:read:organization',
    'api:read:organization',
    'api:write:organization'
  );

-- Assign permissions to practice_manager role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'practice_manager'
  AND p.name IN (
    'users:read:own',
    'users:update:own',
    'users:read:organization',
    'users:create:organization',
    'users:update:organization',
    'practices:read:own',
    'practices:update:own',
    'practices:staff:manage:own',
    'analytics:read:organization',
    'analytics:export:organization',
    'roles:read:organization',
    'settings:read:organization',
    'templates:read:organization',
    'api:read:organization'
  );

-- Assign permissions to practice_staff role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'practice_staff'
  AND p.name IN (
    'users:read:own',
    'users:update:own',
    'users:read:organization',
    'practices:read:own',
    'analytics:read:organization',
    'templates:read:organization'
  );

-- Assign permissions to practice_user role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'practice_user'
  AND p.name IN (
    'users:read:own',
    'users:update:own',
    'practices:read:own',
    'templates:read:organization'
  );

-- Display summary
SELECT 'RBAC Seed Data Summary:' AS info;
SELECT COUNT(*) AS permission_count FROM permissions;
SELECT COUNT(*) AS role_count FROM roles;
SELECT COUNT(*) AS organization_count FROM organizations;
SELECT COUNT(*) AS role_permission_count FROM role_permissions;

SELECT 'Available Roles:' AS info;
SELECT name, description, is_system_role FROM roles ORDER BY is_system_role DESC, name;
