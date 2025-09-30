-- Set the existing measure_type column as the measure type indicator
-- This enables the new dynamic formatting system for existing data sources

-- Update the measure_type column to be marked as the measure type indicator
UPDATE chart_data_source_columns 
SET is_measure_type = true 
WHERE column_name = 'measure_type' 
AND data_source_id IN (
    SELECT data_source_id 
    FROM chart_data_sources 
    WHERE table_name = 'agg_chart_data'
);

-- Verify the update
SELECT 
    cds.data_source_name,
    cds.table_name,
    cdsc.column_name,
    cdsc.display_name,
    cdsc.is_measure_type
FROM chart_data_source_columns cdsc
JOIN chart_data_sources cds ON cdsc.data_source_id = cds.data_source_id
WHERE cdsc.is_measure_type = true;

