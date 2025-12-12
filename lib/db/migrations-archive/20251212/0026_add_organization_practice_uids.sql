-- ============================================================================
-- Migration: Add Organization-Level Analytics Security
-- Description: Add practice_uids array to organizations for data filtering
-- Author: Analytics Security Implementation
-- Date: 2025-10-13
-- ============================================================================

-- Add practice_uids column to organizations table (idempotent)
-- Allows multiple practice_uids per organization (array of integers)
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS practice_uids INTEGER[] DEFAULT '{}';

-- Add GIN index for efficient array lookups (ANY operator performance) (idempotent)
CREATE INDEX IF NOT EXISTS idx_organizations_practice_uids
ON organizations USING GIN (practice_uids);

-- Add comment explaining the column
COMMENT ON COLUMN organizations.practice_uids IS
'Array of practice_uid values from analytics database (ih.agg_app_measures, ih.agg_chart_data, etc.).
Users in this organization can only see analytics data where practice_uid IN practice_uids.
If empty array, organization users see NO data (fail-closed security).
Populated via Organization Settings UI (Edit Organization modal).
Example: ARRAY[100, 101, 102] means users can see data for practice_uid 100, 101, and 102.';

-- Verify the change
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations'
    AND column_name = 'practice_uids'
  ) THEN
    RAISE EXCEPTION 'Migration failed: practice_uids column not created';
  END IF;
  
  RAISE NOTICE 'Successfully added practice_uids column to organizations table';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Populate practice_uids for existing organizations via Admin UI';
  RAISE NOTICE '  2. Query analytics database to find available practice_uid values:';
  RAISE NOTICE '     SELECT DISTINCT practice_uid, practice FROM ih.agg_app_measures ORDER BY practice_uid;';
END $$;
