-- ============================================================================
-- Migration: Add Provider-Level Analytics Permission
-- Description: Create analytics:read:own permission for provider-specific access
-- Author: Analytics Security Implementation
-- Date: 2025-10-13
-- ============================================================================

BEGIN;

-- Create the new permission
INSERT INTO permissions (
  permission_id,
  name,
  description,
  resource,
  action,
  scope,
  is_active,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'analytics:read:own',
  'View analytics data filtered to user''s own provider_uid only. No organization or hierarchy access. Users with this permission see only data where provider_uid matches their user.provider_uid value. Fail-closed security: if user has no provider_uid, no data is visible.',
  'analytics',
  'read',
  'own',
  true,
  NOW(),
  NOW()
)
ON CONFLICT (name) DO NOTHING; -- Idempotent (safe to run multiple times)

-- Verify the permission was created
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM permissions
    WHERE name = 'analytics:read:own'
  ) THEN
    RAISE EXCEPTION 'Migration failed: analytics:read:own permission not created';
  END IF;
  
  RAISE NOTICE 'Successfully created analytics:read:own permission';
  RAISE NOTICE '';
  RAISE NOTICE 'Permission Details:';
  RAISE NOTICE '  Name: analytics:read:own';
  RAISE NOTICE '  Resource: analytics';
  RAISE NOTICE '  Action: read';
  RAISE NOTICE '  Scope: own';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Assign permission to provider roles:';
  RAISE NOTICE '     INSERT INTO role_permissions (role_id, permission_id)';
  RAISE NOTICE '     SELECT r.role_id, p.permission_id';
  RAISE NOTICE '     FROM roles r CROSS JOIN permissions p';
  RAISE NOTICE '     WHERE r.name = ''provider'' AND p.name = ''analytics:read:own'';';
  RAISE NOTICE '';
  RAISE NOTICE '  2. Set provider_uid values in users table';
  RAISE NOTICE '  3. Test provider-level data filtering';
END $$;

COMMIT;

