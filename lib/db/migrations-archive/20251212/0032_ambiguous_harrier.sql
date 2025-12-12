-- ============================================================================
-- Migration: Add Drill-Down Support and Misc Fixes
-- Description: 
--   1. Add drill-down columns to chart_definitions for interactive exploration
--   2. Fix chart_provider_colors default
--   3. Add unique constraint to work_item_status_transitions
-- Author: Drill-Down System
-- Date: 2024-12-03
-- ============================================================================

-- Drop old index (idempotent)
DROP INDEX IF EXISTS "idx_unique_transition";--> statement-breakpoint

-- Fix chart_provider_colors default (idempotent - ALTER COLUMN SET DEFAULT is always safe)
ALTER TABLE "chart_provider_colors" ALTER COLUMN "color_palette_id" SET DEFAULT 'tableau20';--> statement-breakpoint

-- Add drill_down_enabled column (idempotent)
ALTER TABLE "chart_definitions" ADD COLUMN IF NOT EXISTS "drill_down_enabled" boolean DEFAULT false;--> statement-breakpoint

-- Add drill_down_type column (idempotent)
-- Valid values: 'filter' | 'navigate' | 'swap'
ALTER TABLE "chart_definitions" ADD COLUMN IF NOT EXISTS "drill_down_type" text;--> statement-breakpoint

-- Add drill_down_target_chart_id column (idempotent)
-- Self-referential FK - target chart for navigate/swap types
ALTER TABLE "chart_definitions" ADD COLUMN IF NOT EXISTS "drill_down_target_chart_id" uuid;--> statement-breakpoint

-- Add drill_down_button_label column (idempotent)
ALTER TABLE "chart_definitions" ADD COLUMN IF NOT EXISTS "drill_down_button_label" text DEFAULT 'Drill Down';--> statement-breakpoint

-- Add unique constraint for work_item_status_transitions (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uq_transition_type_from_to'
  ) THEN
    ALTER TABLE "work_item_status_transitions" 
    ADD CONSTRAINT "uq_transition_type_from_to" 
    UNIQUE("work_item_type_id","from_status_id","to_status_id");
  END IF;
END $$;--> statement-breakpoint

-- Add column comments for documentation
COMMENT ON COLUMN chart_definitions.drill_down_enabled IS 
'When true, clicking chart elements shows drill-down magnifying glass icon.
Users can then filter the current chart, navigate to another chart, or swap charts.';

COMMENT ON COLUMN chart_definitions.drill_down_type IS 
'Type of drill-down action:
- filter: Filter current chart to show only the clicked value
- navigate: Open target chart in modal, filtered to clicked value
- swap: Replace current chart with target chart (no filter applied)';

COMMENT ON COLUMN chart_definitions.drill_down_target_chart_id IS 
'Target chart ID for navigate/swap drill-down types.
Self-referential FK to chart_definitions. NULL for filter type.';

COMMENT ON COLUMN chart_definitions.drill_down_button_label IS 
'Custom label for drill-down action shown in tooltip. Defaults to "Drill Down".';

-- Verification
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chart_definitions'
    AND column_name = 'drill_down_enabled'
  ) THEN
    RAISE EXCEPTION 'Migration failed: drill_down_enabled column not created';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chart_definitions'
    AND column_name = 'drill_down_type'
  ) THEN
    RAISE EXCEPTION 'Migration failed: drill_down_type column not created';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chart_definitions'
    AND column_name = 'drill_down_target_chart_id'
  ) THEN
    RAISE EXCEPTION 'Migration failed: drill_down_target_chart_id column not created';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chart_definitions'
    AND column_name = 'drill_down_button_label'
  ) THEN
    RAISE EXCEPTION 'Migration failed: drill_down_button_label column not created';
  END IF;
  
  RAISE NOTICE 'Successfully added drill-down columns to chart_definitions table';
END $$;
