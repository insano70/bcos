-- Migration: Update Data Explorer Permissions to 3-Part Naming
-- Date: 2025-10-30
-- Description: Consolidates data-explorer permissions to use 3-part naming
--              Old: data-explorer:metadata:read:organization (4 parts)
--              New: data-explorer:read:organization (3 parts)
--
-- Strategy: 
--   1. Create new 3-part permissions if they don't exist
--   2. Update role_permissions to point to new permission IDs
--   3. Delete old 4-part permissions
--
-- Schema:
--   permissions table: permission_id (uuid PK), name (varchar UNIQUE)
--   role_permissions table: role_permission_id (uuid PK), role_id (uuid FK), permission_id (uuid FK)

-- Start transaction
BEGIN;

-- Step 1: Create new consolidated permissions if they don't exist
INSERT INTO permissions (name, description, resource, action, scope, is_active)
VALUES 
  ('data-explorer:read:organization', 'View table/column metadata and query history for organization', 'data-explorer', 'read', 'organization', true),
  ('data-explorer:read:all', 'View all metadata and query history (super admin)', 'data-explorer', 'read', 'all', true),
  ('data-explorer:manage:all', 'Full data explorer management - metadata, templates, discovery, statistics (super admin only)', 'data-explorer', 'manage', 'all', true)
ON CONFLICT (name) DO NOTHING;

-- Step 2: Get the new permission IDs
DO $$
DECLARE
  read_org_id uuid;
  read_all_id uuid;
  manage_all_id uuid;
BEGIN
  -- Get new permission IDs
  SELECT permission_id INTO read_org_id FROM permissions WHERE name = 'data-explorer:read:organization';
  SELECT permission_id INTO read_all_id FROM permissions WHERE name = 'data-explorer:read:all';
  SELECT permission_id INTO manage_all_id FROM permissions WHERE name = 'data-explorer:manage:all';

  -- Update role_permissions to point to consolidated permissions
  -- Consolidate all read:organization variants
  UPDATE role_permissions
  SET permission_id = read_org_id
  WHERE permission_id IN (
    SELECT permission_id FROM permissions 
    WHERE name IN (
      'data-explorer:metadata:read:organization',
      'data-explorer:history:read:own',
      'data-explorer:history:read:organization',
      'data-explorer:templates:read:organization'
    )
  );

  -- Consolidate all read:all variants
  UPDATE role_permissions
  SET permission_id = read_all_id
  WHERE permission_id IN (
    SELECT permission_id FROM permissions 
    WHERE name IN (
      'data-explorer:metadata:read:all',
      'data-explorer:history:read:all',
      'data-explorer:templates:read:all'
    )
  );

  -- Consolidate all manage:all variants
  UPDATE role_permissions
  SET permission_id = manage_all_id
  WHERE permission_id IN (
    SELECT permission_id FROM permissions 
    WHERE name IN (
      'data-explorer:metadata:manage:all',
      'data-explorer:templates:create:organization',
      'data-explorer:templates:manage:own',
      'data-explorer:templates:manage:all',
      'data-explorer:discovery:run:all'
    )
  );
END $$;

-- Step 3: Remove duplicate role_permissions (same role + permission combination)
DELETE FROM role_permissions rp1
USING role_permissions rp2
WHERE rp1.role_permission_id > rp2.role_permission_id
  AND rp1.role_id = rp2.role_id
  AND rp1.permission_id = rp2.permission_id;

-- Step 4: Delete old 4-part permissions that are no longer used
DELETE FROM permissions
WHERE name IN (
  'data-explorer:metadata:read:organization',
  'data-explorer:metadata:read:all',
  'data-explorer:metadata:manage:all',
  'data-explorer:history:read:own',
  'data-explorer:history:read:organization',
  'data-explorer:history:read:all',
  'data-explorer:templates:read:organization',
  'data-explorer:templates:read:all',
  'data-explorer:templates:create:organization',
  'data-explorer:templates:manage:own',
  'data-explorer:templates:manage:all',
  'data-explorer:discovery:run:all'
);

-- Step 5: Verify changes
SELECT 
  p.name,
  p.description,
  COUNT(rp.role_permission_id) as role_count
FROM permissions p
LEFT JOIN role_permissions rp ON p.permission_id = rp.permission_id
WHERE p.name LIKE 'data-explorer:%'
GROUP BY p.permission_id, p.name, p.description
ORDER BY p.name;

-- Commit transaction
COMMIT;

-- Expected final permissions:
-- data-explorer:query:organization
-- data-explorer:query:all
-- data-explorer:execute:own
-- data-explorer:execute:organization
-- data-explorer:execute:all
-- data-explorer:read:organization
-- data-explorer:read:all
-- data-explorer:manage:all

