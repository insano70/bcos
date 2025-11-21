-- ============================================================================
-- Migration: Mark Expansion Dimensions as Filterable
-- Description: Expansion dimensions must be filterable to work as dimension filters
--              during chart expansion. This updates all expansion dimensions to
--              enable filtering functionality.
-- Author: Dimension Expansion Bug Fix
-- Date: 2024-11-20
-- ============================================================================

-- Mark all expansion dimensions as filterable
-- This allows them to be used as filters during dimension expansion
UPDATE chart_data_source_columns
SET is_filterable = true
WHERE is_expansion_dimension = true
  AND (is_filterable = false OR is_filterable IS NULL);

-- Add comment explaining the relationship
COMMENT ON COLUMN chart_data_source_columns.is_filterable IS
'Marks this column as filterable in queries.
IMPORTANT: All expansion dimensions (is_expansion_dimension = true) must ALSO be filterable
because dimension expansion adds them as filters during chart rendering.';

-- Verify the changes
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO updated_count
  FROM chart_data_source_columns
  WHERE is_expansion_dimension = true AND is_filterable = true;
  
  RAISE NOTICE 'Marked % expansion dimension columns as filterable', updated_count;
END $$;

