-- ============================================================================
-- Migration: Add Provider-Level Analytics Security
-- Description: Add provider_uid to users for provider-specific data filtering
-- Author: Analytics Security Implementation
-- Date: 2025-10-13
-- ============================================================================

BEGIN;

-- Add provider_uid column to users table
ALTER TABLE users
ADD COLUMN provider_uid INTEGER;

-- Add index for efficient filtering
-- Partial index (only users with provider_uid) for performance
CREATE INDEX idx_users_provider_uid
ON users (provider_uid)
WHERE provider_uid IS NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN users.provider_uid IS
'Provider UID from analytics database (ih.agg_app_measures.provider_uid).
Users with analytics:read:own permission can only see data where provider_uid = this value.
If NULL, user with analytics:read:own sees NO data (fail-closed security).
Populated via User Profile Settings or Admin User Management UI.
Example: 42 means user can only see data for provider_uid 42.';

-- Verify the change
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users'
    AND column_name = 'provider_uid'
  ) THEN
    RAISE EXCEPTION 'Migration failed: provider_uid column not created';
  END IF;
  
  RAISE NOTICE 'Successfully added provider_uid column to users table';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Assign analytics:read:own permission to provider roles';
  RAISE NOTICE '  2. Set provider_uid values for provider users via Admin UI';
  RAISE NOTICE '  3. Query analytics database to find available provider_uid values:';
  RAISE NOTICE '     SELECT DISTINCT provider_uid, provider_name FROM ih.agg_app_measures WHERE provider_uid IS NOT NULL ORDER BY provider_uid;';
END $$;

COMMIT;

