-- ============================================================================
-- WORK ITEMS CATCH-UP MIGRATIONS FOR STAGING (bcos_t) AND PRODUCTION (bcos_p)
-- Date: 2025-10-14
-- Description: Create base work items tables + migrations 0020-0024
-- ============================================================================
-- WARNING: These tables don't exist in staging/production yet.
--          They only exist in bcos_d (dev local).
--          Run this AFTER catch-up-migrations.sql (migrations 0025-0031)
-- ============================================================================

BEGIN;

-- ============================================================================
-- BASE WORK ITEMS TABLES (Prerequisites for migrations 0020-0024)
-- ============================================================================

-- Create work_item_types table
CREATE TABLE IF NOT EXISTS work_item_types (
    work_item_type_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(organization_id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    color TEXT,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_by UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_work_item_types_organization ON work_item_types(organization_id);
CREATE INDEX IF NOT EXISTS idx_work_item_types_created_by ON work_item_types(created_by);
CREATE INDEX IF NOT EXISTS idx_work_item_types_deleted_at ON work_item_types(deleted_at);

-- Create work_item_statuses table
CREATE TABLE IF NOT EXISTS work_item_statuses (
    work_item_status_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_item_type_id UUID NOT NULL REFERENCES work_item_types(work_item_type_id) ON DELETE CASCADE,
    status_name TEXT NOT NULL,
    status_category TEXT NOT NULL CHECK (status_category IN ('todo', 'in_progress', 'done', 'blocked')),
    is_initial BOOLEAN DEFAULT false NOT NULL,
    is_final BOOLEAN DEFAULT false NOT NULL,
    color TEXT,
    display_order INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_work_item_statuses_type ON work_item_statuses(work_item_type_id);
CREATE INDEX IF NOT EXISTS idx_work_item_statuses_category ON work_item_statuses(status_category);

-- Create work_items table
CREATE TABLE IF NOT EXISTS work_items (
    work_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_item_type_id UUID NOT NULL REFERENCES work_item_types(work_item_type_id) ON DELETE RESTRICT,
    organization_id UUID NOT NULL REFERENCES organizations(organization_id) ON DELETE RESTRICT,
    subject TEXT NOT NULL,
    description TEXT,
    status_id UUID NOT NULL REFERENCES work_item_statuses(work_item_status_id) ON DELETE RESTRICT,
    priority TEXT DEFAULT 'medium' NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    assigned_to UUID REFERENCES users(user_id) ON DELETE SET NULL,
    due_date TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    parent_work_item_id UUID REFERENCES work_items(work_item_id) ON DELETE SET NULL,
    root_work_item_id UUID REFERENCES work_items(work_item_id) ON DELETE SET NULL,
    depth INTEGER DEFAULT 0 NOT NULL CHECK (depth >= 0 AND depth <= 10),
    path TEXT,
    created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_work_items_type ON work_items(work_item_type_id);
CREATE INDEX IF NOT EXISTS idx_work_items_organization ON work_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_work_items_status ON work_items(status_id);
CREATE INDEX IF NOT EXISTS idx_work_items_assigned_to ON work_items(assigned_to);
CREATE INDEX IF NOT EXISTS idx_work_items_created_by ON work_items(created_by);
CREATE INDEX IF NOT EXISTS idx_work_items_parent ON work_items(parent_work_item_id);
CREATE INDEX IF NOT EXISTS idx_work_items_root ON work_items(root_work_item_id);
CREATE INDEX IF NOT EXISTS idx_work_items_deleted_at ON work_items(deleted_at);
CREATE INDEX IF NOT EXISTS idx_work_items_due_date ON work_items(due_date);

RAISE NOTICE '✅ Base work items tables created';

-- ============================================================================
-- Migration 0020: work_item_fields and work_item_field_values
-- ============================================================================

CREATE TABLE IF NOT EXISTS work_item_fields (
  work_item_field_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_type_id UUID NOT NULL REFERENCES work_item_types(work_item_type_id) ON DELETE CASCADE,
  field_name VARCHAR(100) NOT NULL,
  field_label VARCHAR(255) NOT NULL,
  field_type VARCHAR(50) NOT NULL,
  field_description TEXT,
  field_options JSONB,
  is_required BOOLEAN DEFAULT false,
  validation_rules JSONB,
  default_value TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_visible BOOLEAN DEFAULT true,
  created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_work_item_fields_type ON work_item_fields(work_item_type_id);
CREATE INDEX IF NOT EXISTS idx_work_item_fields_created_by ON work_item_fields(created_by);
CREATE INDEX IF NOT EXISTS idx_work_item_fields_deleted_at ON work_item_fields(deleted_at);
CREATE INDEX IF NOT EXISTS idx_work_item_fields_display_order ON work_item_fields(display_order);
CREATE INDEX IF NOT EXISTS idx_work_item_fields_type_visible ON work_item_fields(work_item_type_id, is_visible);
CREATE INDEX IF NOT EXISTS idx_work_item_fields_type_order ON work_item_fields(work_item_type_id, display_order);

CREATE TABLE IF NOT EXISTS work_item_field_values (
  work_item_field_value_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES work_items(work_item_id) ON DELETE CASCADE,
  work_item_field_id UUID NOT NULL REFERENCES work_item_fields(work_item_field_id) ON DELETE CASCADE,
  field_value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_item_field_values_work_item ON work_item_field_values(work_item_id);
CREATE INDEX IF NOT EXISTS idx_work_item_field_values_field ON work_item_field_values(work_item_field_id);
CREATE INDEX IF NOT EXISTS idx_work_item_field_values_work_item_field ON work_item_field_values(work_item_id, work_item_field_id);

RAISE NOTICE '✅ Migration 0020 applied: work_item_fields and work_item_field_values';

-- ============================================================================
-- Migration 0021: work_item_status_transitions
-- ============================================================================

CREATE TABLE IF NOT EXISTS work_item_status_transitions (
  work_item_status_transition_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_type_id UUID NOT NULL REFERENCES work_item_types(work_item_type_id) ON DELETE CASCADE,
  from_status_id UUID NOT NULL REFERENCES work_item_statuses(work_item_status_id) ON DELETE CASCADE,
  to_status_id UUID NOT NULL REFERENCES work_item_statuses(work_item_status_id) ON DELETE CASCADE,
  is_allowed BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transitions_type ON work_item_status_transitions(work_item_type_id);
CREATE INDEX IF NOT EXISTS idx_transitions_from ON work_item_status_transitions(from_status_id);
CREATE INDEX IF NOT EXISTS idx_transitions_to ON work_item_status_transitions(to_status_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_transition ON work_item_status_transitions(work_item_type_id, from_status_id, to_status_id);

RAISE NOTICE '✅ Migration 0021 applied: work_item_status_transitions';

-- ============================================================================
-- Migration 0022: work_item_attachments
-- ============================================================================

CREATE TABLE IF NOT EXISTS work_item_attachments (
  work_item_attachment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id UUID NOT NULL REFERENCES work_items(work_item_id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 104857600),
  file_type TEXT NOT NULL,
  s3_key TEXT NOT NULL UNIQUE,
  s3_bucket TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(user_id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_attachments_work_item ON work_item_attachments(work_item_id);
CREATE INDEX IF NOT EXISTS idx_attachments_uploaded_by ON work_item_attachments(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_attachments_uploaded_at ON work_item_attachments(uploaded_at);
CREATE INDEX IF NOT EXISTS idx_attachments_deleted_at ON work_item_attachments(deleted_at);

COMMENT ON COLUMN work_item_attachments.s3_key IS 'S3 object key: work-items/{work_item_id}/attachments/{attachment_id}/{filename}';
COMMENT ON COLUMN work_item_attachments.file_size IS 'File size in bytes, max 100MB (104857600 bytes)';

RAISE NOTICE '✅ Migration 0022 applied: work_item_attachments';

-- ============================================================================
-- Migration 0023: dual_axis_config column (NOTE: This will be dropped in 0029)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chart_definitions' AND column_name = 'dual_axis_config'
  ) THEN
    ALTER TABLE chart_definitions
    ADD COLUMN dual_axis_config JSONB DEFAULT NULL;

    CREATE INDEX idx_chart_definitions_dual_axis_enabled ON chart_definitions ((dual_axis_config->>'enabled'))
    WHERE dual_axis_config IS NOT NULL AND (dual_axis_config->>'enabled')::boolean = true;

    COMMENT ON COLUMN chart_definitions.dual_axis_config IS 'Dual-axis configuration for combo charts.';

    RAISE NOTICE '✅ Migration 0023 applied: dual_axis_config column added';
    RAISE NOTICE '⚠️  NOTE: This column will be dropped in migration 0029';
  ELSE
    RAISE NOTICE '⏭️  Migration 0023 skipped: dual_axis_config already exists';
  END IF;
END $$;

-- ============================================================================
-- Migration 0024: work_item_type_relationships
-- ============================================================================

CREATE TABLE IF NOT EXISTS work_item_type_relationships (
  work_item_type_relationship_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_type_id UUID NOT NULL REFERENCES work_item_types(work_item_type_id) ON DELETE CASCADE,
  child_type_id UUID NOT NULL REFERENCES work_item_types(work_item_type_id) ON DELETE CASCADE,
  relationship_name TEXT NOT NULL,
  is_required BOOLEAN DEFAULT false NOT NULL,
  min_count INTEGER,
  max_count INTEGER,
  auto_create BOOLEAN DEFAULT false NOT NULL,
  auto_create_config JSONB,
  display_order INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_type_relationships_parent ON work_item_type_relationships(parent_type_id);
CREATE INDEX IF NOT EXISTS idx_type_relationships_child ON work_item_type_relationships(child_type_id);
CREATE INDEX IF NOT EXISTS idx_type_relationships_deleted_at ON work_item_type_relationships(deleted_at);
CREATE INDEX IF NOT EXISTS idx_unique_type_relationship ON work_item_type_relationships(parent_type_id, child_type_id, deleted_at);

RAISE NOTICE '✅ Migration 0024 applied: work_item_type_relationships';

-- ============================================================================
-- Record migrations in drizzle.__drizzle_migrations table
-- ============================================================================
DO $$
DECLARE
  migration_tags TEXT[] := ARRAY[
    '0020_work_item_custom_fields',
    '0021_work_item_status_transitions',
    '0022_work_item_attachments',
    '0023_add_dual_axis_config',
    '0024_work_item_type_relationships'
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
-- ✅ WORK ITEMS MIGRATIONS COMPLETE
-- ============================================================================
SELECT '✅ All work items migrations applied successfully!' AS status;
SELECT '⚠️  NOTE: You still need to populate work_item_types and work_item_statuses via Admin UI' AS next_steps;
