-- ============================================================================
-- Migration: Add Expansion Dimension Support
-- Description: Add is_expansion_dimension and expansion_display_name columns
--              to chart_data_source_columns for dimension-based chart expansion
-- Author: Dimension Expansion System
-- Date: 2024-11-18
-- ============================================================================

-- Add is_expansion_dimension column (idempotent)
-- Marks columns available for dimension expansion (e.g., location, line_of_business)
ALTER TABLE chart_data_source_columns
ADD COLUMN IF NOT EXISTS is_expansion_dimension BOOLEAN DEFAULT false;

-- Add expansion_display_name column (idempotent)
-- Optional display name override for dimension expansion UI
ALTER TABLE chart_data_source_columns
ADD COLUMN IF NOT EXISTS expansion_display_name VARCHAR(100);

-- Add GIN index for efficient expansion dimension lookups (idempotent)
CREATE INDEX IF NOT EXISTS idx_data_source_columns_expansion
ON chart_data_source_columns(data_source_id, is_expansion_dimension)
WHERE is_expansion_dimension = true;

-- Add comment explaining the columns
COMMENT ON COLUMN chart_data_source_columns.is_expansion_dimension IS
'Marks this column as available for dimension expansion (e.g., location, line_of_business).
When true, users can expand charts to view side-by-side comparisons for each unique value.
System automatically discovers unique dimension values from analytics data.';

COMMENT ON COLUMN chart_data_source_columns.expansion_display_name IS
'Optional display name override for dimension expansion UI.
If not set, uses display_name column value.
Example: "Location" instead of "location_id" or "Line of Business" instead of "lob_code".';

-- Verify the changes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chart_data_source_columns'
    AND column_name = 'is_expansion_dimension'
  ) THEN
    RAISE EXCEPTION 'Migration failed: is_expansion_dimension column not created';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chart_data_source_columns'
    AND column_name = 'expansion_display_name'
  ) THEN
    RAISE EXCEPTION 'Migration failed: expansion_display_name column not created';
  END IF;
  
  RAISE NOTICE 'Successfully added expansion dimension columns to chart_data_source_columns table';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Configure expansion dimensions via Data Source Admin UI';
  RAISE NOTICE '  2. Mark columns (e.g., location, line_of_business) as expansion dimensions';
  RAISE NOTICE '  3. Users can expand charts to view side-by-side dimension comparisons';
END $$;

