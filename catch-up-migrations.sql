-- ============================================================================
-- CATCH-UP MIGRATIONS FOR STAGING (bcos_t) AND PRODUCTION (bcos_p)
-- Date: 2025-10-14
-- Description: Manually apply migrations 0025-0031 to bring databases up to date
-- ============================================================================
-- INSTRUCTIONS:
--   Staging:    psql -h <staging-host> -U bcos_t -d bcos_t -f catch-up-migrations.sql
--   Production: psql -h <production-host> -U bcos_p -d bcos_p -f catch-up-migrations.sql
-- ============================================================================

BEGIN;

-- ============================================================================
-- Migration 0025: Add data_source_id to chart_definitions
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chart_definitions' AND column_name = 'data_source_id'
  ) THEN
    ALTER TABLE chart_definitions
    ADD COLUMN data_source_id INTEGER
    REFERENCES chart_data_sources(data_source_id) ON DELETE SET NULL;

    CREATE INDEX idx_chart_definitions_data_source
    ON chart_definitions(data_source_id);

    UPDATE chart_definitions
    SET data_source_id = (chart_config->>'dataSourceId')::integer
    WHERE chart_config->>'dataSourceId' IS NOT NULL
      AND chart_config->>'dataSourceId' ~ '^[0-9]+$';

    COMMENT ON COLUMN chart_definitions.data_source_id IS
      'Foreign key to chart_data_sources. Denormalized from chart_config JSON for performance and referential integrity.';

    RAISE NOTICE '✅ Migration 0025 applied: data_source_id column added';
  ELSE
    RAISE NOTICE '⏭️  Migration 0025 skipped: data_source_id already exists';
  END IF;
END $$;

-- ============================================================================
-- Migration 0026: Add practice_uids to organizations
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'organizations' AND column_name = 'practice_uids'
  ) THEN
    ALTER TABLE organizations
    ADD COLUMN practice_uids INTEGER[] DEFAULT '{}';

    CREATE INDEX idx_organizations_practice_uids
    ON organizations USING GIN (practice_uids);

    COMMENT ON COLUMN organizations.practice_uids IS
    'Array of practice_uid values from analytics database. Users in this organization can only see analytics data where practice_uid IN practice_uids. If empty array, organization users see NO data (fail-closed security).';

    RAISE NOTICE '✅ Migration 0026 applied: practice_uids column added';
  ELSE
    RAISE NOTICE '⏭️  Migration 0026 skipped: practice_uids already exists';
  END IF;
END $$;

-- ============================================================================
-- Migration 0027: Add provider_uid to users
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'provider_uid'
  ) THEN
    ALTER TABLE users
    ADD COLUMN provider_uid INTEGER;

    CREATE INDEX idx_users_provider_uid
    ON users (provider_uid)
    WHERE provider_uid IS NOT NULL;

    COMMENT ON COLUMN users.provider_uid IS
    'Provider UID from analytics database. Users with analytics:read:own permission can only see data where provider_uid = this value. If NULL, user sees NO data (fail-closed security).';

    RAISE NOTICE '✅ Migration 0027 applied: provider_uid column added';
  ELSE
    RAISE NOTICE '⏭️  Migration 0027 skipped: provider_uid already exists';
  END IF;
END $$;

-- ============================================================================
-- Migration 0028: Add analytics:read:own permission
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM permissions WHERE name = 'analytics:read:own'
  ) THEN
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
      'View analytics data filtered to user''s own provider_uid only. No organization or hierarchy access.',
      'analytics',
      'read',
      'own',
      true,
      NOW(),
      NOW()
    );

    RAISE NOTICE '✅ Migration 0028 applied: analytics:read:own permission created';
  ELSE
    RAISE NOTICE '⏭️  Migration 0028 skipped: analytics:read:own permission already exists';
  END IF;
END $$;

-- ============================================================================
-- Migration 0029: Drop unused dual_axis_config column
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chart_definitions' AND column_name = 'dual_axis_config'
  ) THEN
    DROP INDEX IF EXISTS idx_chart_definitions_dual_axis_enabled;

    ALTER TABLE chart_definitions
    DROP COLUMN dual_axis_config;

    COMMENT ON TABLE chart_definitions IS 'Chart definitions with configuration stored in chart_config JSON. Dual-axis charts use chart_config.dualAxisConfig (not a separate column).';

    RAISE NOTICE '✅ Migration 0029 applied: dual_axis_config column dropped';
  ELSE
    RAISE NOTICE '⏭️  Migration 0029 skipped: dual_axis_config already dropped';
  END IF;
END $$;

-- ============================================================================
-- Migration 0030: Add MFA skip tracking columns
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'account_security' AND column_name = 'mfa_skips_remaining'
  ) THEN
    ALTER TABLE account_security
      ADD COLUMN mfa_skips_remaining INTEGER NOT NULL DEFAULT 5,
      ADD COLUMN mfa_skip_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN mfa_first_skipped_at TIMESTAMPTZ,
      ADD COLUMN mfa_last_skipped_at TIMESTAMPTZ;

    CREATE INDEX idx_account_security_mfa_skips
      ON account_security(mfa_skips_remaining)
      WHERE mfa_enabled = false AND mfa_skips_remaining <= 0;

    UPDATE account_security
    SET mfa_skips_remaining = 5
    WHERE mfa_enabled = false;

    COMMENT ON COLUMN account_security.mfa_skips_remaining IS
      'Number of remaining times user can skip MFA setup. Starts at 5, decrements to 0. When 0, MFA setup is mandatory.';

    RAISE NOTICE '✅ Migration 0030 applied: MFA skip tracking columns added';
  ELSE
    RAISE NOTICE '⏭️  Migration 0030 skipped: MFA skip columns already exist';
  END IF;
END $$;

-- ============================================================================
-- Migration 0031: Add organization_id to dashboards
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dashboards' AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE dashboards
    ADD COLUMN organization_id UUID REFERENCES organizations(organization_id) ON DELETE SET NULL;

    CREATE INDEX idx_dashboards_organization_id
    ON dashboards(organization_id);

    CREATE INDEX idx_dashboards_published_org
    ON dashboards(is_published, organization_id)
    WHERE is_active = true;

    COMMENT ON COLUMN dashboards.organization_id IS
    'Organization scoping for dashboards. NULL = Universal dashboard (visible to all organizations). UUID = Organization-specific dashboard.';

    RAISE NOTICE '✅ Migration 0031 applied: organization_id column added to dashboards';
  ELSE
    RAISE NOTICE '⏭️  Migration 0031 skipped: organization_id already exists';
  END IF;
END $$;

-- ============================================================================
-- Record migrations in drizzle.__drizzle_migrations table
-- ============================================================================
DO $$
DECLARE
  migration_tags TEXT[] := ARRAY[
    '0025_add_data_source_id_to_chart_definitions',
    '0026_add_organization_practice_uids',
    '0027_add_user_provider_uid',
    '0028_add_analytics_read_own_permission',
    '0029_drop_unused_dual_axis_config',
    '0030_add_mfa_skip_tracking',
    '0031_add_organization_id_to_dashboards'
  ];
  tag TEXT;
BEGIN
  FOREACH tag IN ARRAY migration_tags
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM drizzle.__drizzle_migrations
      WHERE hash = md5(tag)
    ) THEN
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (md5(tag), EXTRACT(EPOCH FROM NOW()) * 1000);

      RAISE NOTICE '📝 Recorded migration: %', tag;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- ============================================================================
-- ✅ CATCH-UP COMPLETE
-- ============================================================================
SELECT '✅ All catch-up migrations applied successfully!' AS status;
