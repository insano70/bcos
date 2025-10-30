-- ============================================================================
-- Migration: Add Organization Scoping to Dashboards
-- Description: Add organization_id column to dashboards table
--              NULL = Universal dashboard (visible to all organizations)
--              UUID = Organization-specific dashboard (visible only to that org)
-- Author: Dashboard Organization Filtering Implementation
-- Date: 2025-10-14
-- ============================================================================


-- Add organization_id column (nullable for universal dashboards) (idempotent)
ALTER TABLE dashboards
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(organization_id) ON DELETE SET NULL;

-- Add index for query performance (idempotent)
CREATE INDEX IF NOT EXISTS idx_dashboards_organization_id
ON dashboards(organization_id);

-- Add composite index for common query pattern (published + active + org filter) (idempotent)
CREATE INDEX IF NOT EXISTS idx_dashboards_published_org
ON dashboards(is_published, organization_id)
WHERE is_active = true;

-- Document the behavior
COMMENT ON COLUMN dashboards.organization_id IS
'Organization scoping for dashboards.
NULL = Universal dashboard (visible to all organizations).
UUID = Organization-specific dashboard (visible only to members of this organization).
Existing dashboards default to NULL (universal) - no backfill needed.
Data is always filtered at query time via practice_uids, so sharing dashboard configs is secure.
Create org-specific: INSERT ... organization_id = ''uuid''
Create universal: INSERT ... organization_id = NULL
Query filtering: WHERE organization_id IS NULL OR organization_id IN (user_accessible_orgs)';

-- Verify the change
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dashboards'
    AND column_name = 'organization_id'
  ) THEN
    RAISE EXCEPTION 'Migration failed: organization_id column not created';
  END IF;

  -- Check that existing dashboards are NULL (universal)
  IF EXISTS (
    SELECT 1 FROM dashboards WHERE organization_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Migration validation failed: Found dashboards with non-null organization_id';
  END IF;

  RAISE NOTICE 'Successfully added organization_id column to dashboards table';
  RAISE NOTICE 'All % existing dashboards remain universal (organization_id = NULL)',
    (SELECT COUNT(*) FROM dashboards);
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Universal dashboards (NULL) are visible to all organizations';
  RAISE NOTICE '  2. Create org-specific dashboard: SET organization_id = org_uuid';
  RAISE NOTICE '  3. Convert to universal: SET organization_id = NULL';
  RAISE NOTICE '  4. Service layer automatically filters by user organization scope';
END $$;

