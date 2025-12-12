
-- ============================================================================
-- Migration: Drop Unused dual_axis_config Column
-- Description: Remove unused dual_axis_config column from chart_definitions
-- Author: System Analysis
-- Date: 2025-10-13
-- ============================================================================
--
-- RATIONALE:
-- The dual_axis_config column was added in migration 0023 but is not used:
-- - All dual-axis charts store config in chart_config->dualAxisConfig (nested JSON)
-- - The top-level dual_axis_config column has NULL values for all records
-- - Code implementation reads from chart_config.dualAxisConfig, not this column
-- - Column was never added to Drizzle schema files
-- - This removes technical debt and eliminates confusion
--
-- SAFETY:
-- - Verified all dual-axis charts have NULL in this column
-- - No application code references this column
-- - No data loss - actual config stored in chart_config JSON
-- ============================================================================

-- Drop the index first
DROP INDEX IF EXISTS idx_chart_definitions_dual_axis_enabled;

-- Drop the unused column
ALTER TABLE chart_definitions
DROP COLUMN IF EXISTS dual_axis_config;

-- Add comment for audit trail
COMMENT ON TABLE chart_definitions IS 'Chart definitions with configuration stored in chart_config JSON. Dual-axis charts use chart_config.dualAxisConfig (not a separate column).';