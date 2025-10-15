-- Fix DS #3 Column Configuration
-- The "measure" column should be the one containing measure NAMES, not VALUES

BEGIN;

-- First, check current configuration
SELECT 
  cdsc.column_name,
  cdsc.display_name,
  cdsc.is_measure,
  cdsc.is_dimension,
  cdsc.data_type
FROM chart_data_source_columns cdsc
WHERE cdsc.data_source_id = 3
  AND cdsc.column_name IN ('measure', 'numeric_value', 'text_value')
ORDER BY cdsc.column_name;

-- Fix: Mark 'measure' as the measure column (contains measure names)
UPDATE chart_data_source_columns
SET 
  is_measure = true,
  is_dimension = false
WHERE data_source_id = 3
  AND column_name = 'measure';

-- Fix: Mark 'numeric_value' as NOT a measure (it's a value, not a measure name)
UPDATE chart_data_source_columns
SET 
  is_measure = false,
  is_dimension = false
WHERE data_source_id = 3
  AND column_name = 'numeric_value';

-- Show updated configuration
SELECT 
  cdsc.column_name,
  cdsc.display_name,
  cdsc.is_measure,
  cdsc.is_dimension,
  cdsc.data_type
FROM chart_data_source_columns cdsc
WHERE cdsc.data_source_id = 3
  AND cdsc.column_name IN ('measure', 'numeric_value', 'text_value')
ORDER BY cdsc.column_name;

COMMIT;

