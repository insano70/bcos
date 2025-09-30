-- Migration: Add is_time_period column to chart_data_source_columns
-- This column allows marking any column as containing time period/frequency information
-- for dynamic frequency dropdown population in the chart builder

-- Add the new column
ALTER TABLE chart_data_source_columns 
ADD COLUMN IF NOT EXISTS is_time_period BOOLEAN DEFAULT false;

-- Update the index to include the new column for performance
DROP INDEX IF EXISTS idx_chart_data_source_columns_flags;
CREATE INDEX idx_chart_data_source_columns_flags 
ON chart_data_source_columns(is_filterable, is_groupable, is_measure, is_measure_type, is_time_period);

-- Add comment to document the purpose
COMMENT ON COLUMN chart_data_source_columns.is_time_period IS 
'Indicates this column contains time period/frequency information (Monthly, Weekly, Quarterly, etc.) used for chart filtering and grouping';
