-- Seed Chart Configuration Data
-- Populates the chart configuration tables with ih.agg_app_measures setup

-- 1. Insert the main data source
INSERT INTO chart_data_sources (
    data_source_name,
    data_source_description,
    table_name,
    schema_name,
    database_type,
    is_active,
    requires_auth
) VALUES (
    'Practice Analytics',
    'Pre-aggregated practice and provider performance measures',
    'agg_app_measures',
    'ih',
    'postgresql',
    true,
    true
) ;

-- Get the data source ID
DO $$
DECLARE
    ds_id INTEGER;
BEGIN
    SELECT data_source_id INTO ds_id FROM chart_data_sources WHERE table_name = 'agg_app_measures' AND schema_name = 'ih';
    
    -- 2. Insert column configurations
    INSERT INTO chart_data_source_columns (
        data_source_id, column_name, display_name, column_description, data_type,
        is_filterable, is_groupable, is_measure, is_dimension, is_date_field,
        format_type, sort_order, default_aggregation, example_value
    ) VALUES 
    (ds_id, 'practice', 'Practice Name', 'Practice name/identifier', 'string', true, true, false, true, false, 'string', 1, null, 'Family Arthritis Center'),
    (ds_id, 'practice_primary', 'Practice Primary', 'Primary practice identifier', 'string', true, true, false, true, false, 'string', 2, null, 'Busch, Howard'),
    (ds_id, 'practice_uid', 'Practice UID', 'Practice unique identifier for filtering', 'number', true, true, false, true, false, 'number', 3, null, '114'),
    (ds_id, 'provider_name', 'Provider Name', 'Provider name', 'string', true, true, false, true, false, 'string', 4, null, 'Busch, Howard'),
    (ds_id, 'measure', 'Measure Type', 'What is being measured', 'string', true, true, false, true, false, 'string', 5, null, 'Charges by Provider'),
    (ds_id, 'frequency', 'Frequency', 'Time frequency of measurement', 'string', true, true, false, true, false, 'string', 6, null, 'Monthly'),
    (ds_id, 'date_index', 'Date', 'Date field for filtering and X-axis', 'date', true, false, false, true, true, 'date', 7, null, '2025-03-31'),
    (ds_id, 'measure_value', 'Value', 'The measured numeric value', 'number', true, false, true, false, false, 'currency', 8, 'sum', '506992'),
    (ds_id, 'measure_type', 'Measure Type', 'Type of measurement', 'string', true, true, false, true, false, 'string', 9, null, 'currency');
END $$;

-- 3. Insert default color palettes
INSERT INTO color_palettes (
    palette_name,
    palette_description,
    colors,
    palette_type,
    max_colors,
    is_colorblind_safe,
    is_default,
    is_system
) VALUES 
(
    'Default Analytics',
    'Default color palette for analytics charts',
    '["#00AEEF", "#67bfff", "#3ec972", "#f0bb33", "#ff5656", "oklch(65.6% 0.241 354.308)", "oklch(58.5% 0.233 277.117)", "oklch(70.5% 0.213 47.604)"]',
    'categorical',
    8,
    false,
    true,
    true
),
(
    'Accessible Blues',
    'Colorblind-safe blue palette',
    '["#08519c", "#3182bd", "#6baed6", "#9ecae1", "#c6dbef", "#deebf7"]',
    'sequential',
    6,
    true,
    false,
    true
) ;

-- 4. Insert chart display configurations
INSERT INTO chart_display_configs (
    chart_type,
    frequency,
    x_axis_config,
    y_axis_config,
    time_unit,
    time_display_format,
    time_tooltip_format,
    show_legend,
    show_tooltips,
    enable_animation,
    is_default
) VALUES 
-- Bar chart configurations
('bar', 'Monthly', '{"type": "category"}', '{"beginAtZero": true}', 'month', 'MMM YYYY', 'MMM YYYY', true, true, true, true),
('bar', 'Weekly', '{"type": "category"}', '{"beginAtZero": true}', 'week', 'DD-MMM-YY', 'DD-MMM-YYYY', true, true, true, false),
('bar', 'Quarterly', '{"type": "category"}', '{"beginAtZero": true}', 'quarter', '[Q]Q YYYY', '[Q]Q YYYY', true, true, true, false),

-- Line chart configurations  
('line', 'Monthly', '{"type": "time", "time": {"unit": "month"}}', '{"beginAtZero": true}', 'month', 'MMM YY', 'MMM YYYY', false, true, true, true),
('line', 'Weekly', '{"type": "time", "time": {"unit": "week"}}', '{"beginAtZero": true}', 'week', 'DD-MMM', 'DD-MMM-YYYY', false, true, true, false),
('line', 'Quarterly', '{"type": "time", "time": {"unit": "quarter"}}', '{"beginAtZero": true}', 'quarter', '[Q]Q YY', '[Q]Q YYYY', false, true, true, false),

-- Pie/Doughnut configurations
('pie', null, null, null, null, null, null, true, true, true, true),
('doughnut', null, null, null, null, null, null, true, true, true, true)
;

-- 5. Insert component configurations
INSERT INTO chart_component_configs (
    component_name,
    chart_type,
    default_props,
    max_data_points,
    enable_virtualization
) VALUES 
('AnalyticsBarChart', 'bar', '{"barPercentage": 0.7, "categoryPercentage": 0.7}', 1000, false),
('LineChart01', 'line', '{"tension": 0.4, "pointRadius": 4}', 1000, false),
('DoughnutChart', 'doughnut', '{"cutout": "50%"}', 100, false)
;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_chart_data_sources_active ON chart_data_sources(is_active);
CREATE INDEX IF NOT EXISTS idx_chart_data_source_columns_data_source ON chart_data_source_columns(data_source_id);
CREATE INDEX IF NOT EXISTS idx_chart_data_source_columns_flags ON chart_data_source_columns(is_filterable, is_groupable, is_measure);
CREATE INDEX IF NOT EXISTS idx_chart_display_configs_type_freq ON chart_display_configs(chart_type, frequency);
CREATE INDEX IF NOT EXISTS idx_color_palettes_default ON color_palettes(is_default, is_active);

SELECT 'Chart configuration system initialized successfully' as result;
