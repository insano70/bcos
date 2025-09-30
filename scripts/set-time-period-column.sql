-- Set the existing frequency/time_period columns as the time period indicators
-- This enables the new dynamic frequency dropdown system for existing data sources

-- Update the frequency column for agg_app_measures data source
UPDATE chart_data_source_columns 
SET is_time_period = true 
WHERE column_name = 'frequency' 
AND data_source_id IN (
    SELECT data_source_id 
    FROM chart_data_sources 
    WHERE table_name = 'agg_app_measures'
);

-- Update the time_period column for agg_chart_data data source
UPDATE chart_data_source_columns 
SET is_time_period = true 
WHERE column_name = 'time_period' 
AND data_source_id IN (
    SELECT data_source_id 
    FROM chart_data_sources 
    WHERE table_name = 'agg_chart_data'
);

-- Verify the updates
SELECT 
    cds.data_source_name,
    cds.table_name,
    cdsc.column_name,
    cdsc.display_name,
    cdsc.is_time_period
FROM chart_data_source_columns cdsc
JOIN chart_data_sources cds ON cdsc.data_source_id = cds.data_source_id
WHERE cdsc.is_time_period = true
ORDER BY cds.data_source_name, cdsc.column_name;
