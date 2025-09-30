-- Migration: Add is_measure_type column to chart_data_source_columns
-- This column allows marking any column as containing measure type information
-- for dynamic formatting in charts

-- Add the new column
ALTER TABLE chart_data_source_columns 
ADD COLUMN IF NOT EXISTS is_measure_type BOOLEAN DEFAULT false;

-- Update the index to include the new column for performance
DROP INDEX IF EXISTS idx_chart_data_source_columns_flags;
CREATE INDEX idx_chart_data_source_columns_flags 
ON chart_data_source_columns(is_filterable, is_groupable, is_measure, is_measure_type);

-- Set the measure_type column as the measure type indicator for existing data source
-- This assumes the existing agg_chart_data source has a measure_type column
UPDATE chart_data_source_columns 
SET is_measure_type = true 
WHERE column_name = 'measure_type' 
AND data_source_id IN (
    SELECT data_source_id 
    FROM chart_data_sources 
    WHERE table_name = 'agg_chart_data'
);

-- Add comment to document the purpose
COMMENT ON COLUMN chart_data_source_columns.is_measure_type IS 
'Indicates this column contains measure type information (currency, count, etc.) used for chart formatting';

