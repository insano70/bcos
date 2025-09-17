-- Chart Configuration Tables
-- Creates database-driven configuration system to replace hardcoded settings

-- Main data source registry for analytics
CREATE TABLE IF NOT EXISTS chart_data_sources (
    data_source_id SERIAL PRIMARY KEY,
    data_source_name VARCHAR(100) NOT NULL,
    data_source_description TEXT,
    table_name VARCHAR(100) NOT NULL,
    schema_name VARCHAR(50) NOT NULL,
    database_type VARCHAR(50) DEFAULT 'postgresql',
    connection_config JSONB,
    is_active BOOLEAN DEFAULT true,
    requires_auth BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(user_id)
);

-- Column metadata and properties for each data source
CREATE TABLE IF NOT EXISTS chart_data_source_columns (
    column_id SERIAL PRIMARY KEY,
    data_source_id INTEGER REFERENCES chart_data_sources(data_source_id) ON DELETE CASCADE,
    column_name VARCHAR(100) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    column_description TEXT,
    data_type VARCHAR(50) NOT NULL,
    
    -- Chart functionality flags
    is_filterable BOOLEAN DEFAULT false,
    is_groupable BOOLEAN DEFAULT false,
    is_measure BOOLEAN DEFAULT false,
    is_dimension BOOLEAN DEFAULT false,
    is_date_field BOOLEAN DEFAULT false,
    
    -- Display and formatting
    format_type VARCHAR(50),
    sort_order INTEGER DEFAULT 0,
    default_aggregation VARCHAR(20),
    
    -- Security and validation
    is_sensitive BOOLEAN DEFAULT false,
    access_level VARCHAR(20) DEFAULT 'all',
    allowed_values JSONB,
    validation_rules JSONB,
    
    -- Metadata
    example_value TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(data_source_id, column_name)
);

-- Chart display configurations
CREATE TABLE IF NOT EXISTS chart_display_configs (
    config_id SERIAL PRIMARY KEY,
    chart_type VARCHAR(50) NOT NULL,
    frequency VARCHAR(20),
    
    -- Chart.js configuration
    x_axis_config JSONB,
    y_axis_config JSONB,
    
    -- Display settings
    default_width INTEGER DEFAULT 800,
    default_height INTEGER DEFAULT 400,
    padding_config JSONB,
    
    -- Time axis settings
    time_unit VARCHAR(20),
    time_display_format VARCHAR(50),
    time_tooltip_format VARCHAR(50),
    
    -- Chart options
    show_legend BOOLEAN DEFAULT true,
    show_tooltips BOOLEAN DEFAULT true,
    enable_animation BOOLEAN DEFAULT true,
    
    -- Color settings
    default_color_palette_id INTEGER,
    
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(chart_type, frequency)
);

-- Color palettes
CREATE TABLE IF NOT EXISTS color_palettes (
    palette_id SERIAL PRIMARY KEY,
    palette_name VARCHAR(100) NOT NULL,
    palette_description TEXT,
    colors JSONB NOT NULL,
    
    -- Usage context
    palette_type VARCHAR(50) DEFAULT 'general',
    max_colors INTEGER,
    
    -- Accessibility
    is_colorblind_safe BOOLEAN DEFAULT false,
    contrast_ratio DECIMAL(3,2),
    
    -- Metadata
    is_default BOOLEAN DEFAULT false,
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(user_id)
);

-- Chart component configurations
CREATE TABLE IF NOT EXISTS chart_component_configs (
    component_config_id SERIAL PRIMARY KEY,
    component_name VARCHAR(100) NOT NULL,
    chart_type VARCHAR(50) NOT NULL,
    
    -- Component settings
    default_props JSONB,
    style_overrides JSONB,
    feature_flags JSONB,
    
    -- Performance settings
    max_data_points INTEGER DEFAULT 1000,
    enable_virtualization BOOLEAN DEFAULT false,
    lazy_loading BOOLEAN DEFAULT false,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(component_name, chart_type)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_chart_data_sources_active ON chart_data_sources(is_active);
CREATE INDEX IF NOT EXISTS idx_chart_data_source_columns_data_source ON chart_data_source_columns(data_source_id);
CREATE INDEX IF NOT EXISTS idx_chart_data_source_columns_flags ON chart_data_source_columns(is_filterable, is_groupable, is_measure);
CREATE INDEX IF NOT EXISTS idx_chart_display_configs_type_freq ON chart_display_configs(chart_type, frequency);
CREATE INDEX IF NOT EXISTS idx_color_palettes_default ON color_palettes(is_default, is_active);

-- Add foreign key constraint for color palettes after table creation
ALTER TABLE chart_display_configs 
ADD CONSTRAINT fk_chart_display_configs_color_palette 
FOREIGN KEY (default_color_palette_id) REFERENCES color_palettes(palette_id);

SELECT 'Chart configuration tables created successfully' as result;


-- Main data source registry for analytics
CREATE TABLE IF NOT EXISTS chart_data_sources (
    data_source_id SERIAL PRIMARY KEY,
    data_source_name VARCHAR(100) NOT NULL,
    data_source_description TEXT,
    table_name VARCHAR(100) NOT NULL,
    schema_name VARCHAR(50) NOT NULL,
    database_type VARCHAR(50) DEFAULT 'postgresql',
    connection_config JSONB,
    is_active BOOLEAN DEFAULT true,
    requires_auth BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(user_id)
);

-- Column metadata and properties for each data source
CREATE TABLE IF NOT EXISTS chart_data_source_columns (
    column_id SERIAL PRIMARY KEY,
    data_source_id INTEGER REFERENCES chart_data_sources(data_source_id) ON DELETE CASCADE,
    column_name VARCHAR(100) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    column_description TEXT,
    data_type VARCHAR(50) NOT NULL,
    
    -- Chart functionality flags
    is_filterable BOOLEAN DEFAULT false,
    is_groupable BOOLEAN DEFAULT false,
    is_measure BOOLEAN DEFAULT false,
    is_dimension BOOLEAN DEFAULT false,
    is_date_field BOOLEAN DEFAULT false,
    
    -- Display and formatting
    format_type VARCHAR(50),
    sort_order INTEGER DEFAULT 0,
    default_aggregation VARCHAR(20),
    
    -- Security and validation
    is_sensitive BOOLEAN DEFAULT false,
    access_level VARCHAR(20) DEFAULT 'all',
    allowed_values JSONB,
    validation_rules JSONB,
    
    -- Metadata
    example_value TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(data_source_id, column_name)
);

-- Chart display configurations
CREATE TABLE IF NOT EXISTS chart_display_configs (
    config_id SERIAL PRIMARY KEY,
    chart_type VARCHAR(50) NOT NULL,
    frequency VARCHAR(20),
    
    -- Chart.js configuration
    x_axis_config JSONB,
    y_axis_config JSONB,
    
    -- Display settings
    default_width INTEGER DEFAULT 800,
    default_height INTEGER DEFAULT 400,
    padding_config JSONB,
    
    -- Time axis settings
    time_unit VARCHAR(20),
    time_display_format VARCHAR(50),
    time_tooltip_format VARCHAR(50),
    
    -- Chart options
    show_legend BOOLEAN DEFAULT true,
    show_tooltips BOOLEAN DEFAULT true,
    enable_animation BOOLEAN DEFAULT true,
    
    -- Color settings
    default_color_palette_id INTEGER,
    
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(chart_type, frequency)
);

-- Color palettes
CREATE TABLE IF NOT EXISTS color_palettes (
    palette_id SERIAL PRIMARY KEY,
    palette_name VARCHAR(100) NOT NULL,
    palette_description TEXT,
    colors JSONB NOT NULL,
    
    -- Usage context
    palette_type VARCHAR(50) DEFAULT 'general',
    max_colors INTEGER,
    
    -- Accessibility
    is_colorblind_safe BOOLEAN DEFAULT false,
    contrast_ratio DECIMAL(3,2),
    
    -- Metadata
    is_default BOOLEAN DEFAULT false,
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(user_id)
);

-- Chart component configurations
CREATE TABLE IF NOT EXISTS chart_component_configs (
    component_config_id SERIAL PRIMARY KEY,
    component_name VARCHAR(100) NOT NULL,
    chart_type VARCHAR(50) NOT NULL,
    
    -- Component settings
    default_props JSONB,
    style_overrides JSONB,
    feature_flags JSONB,
    
    -- Performance settings
    max_data_points INTEGER DEFAULT 1000,
    enable_virtualization BOOLEAN DEFAULT false,
    lazy_loading BOOLEAN DEFAULT false,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(component_name, chart_type)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_chart_data_sources_active ON chart_data_sources(is_active);
CREATE INDEX IF NOT EXISTS idx_chart_data_source_columns_data_source ON chart_data_source_columns(data_source_id);
CREATE INDEX IF NOT EXISTS idx_chart_data_source_columns_flags ON chart_data_source_columns(is_filterable, is_groupable, is_measure);
CREATE INDEX IF NOT EXISTS idx_chart_display_configs_type_freq ON chart_display_configs(chart_type, frequency);
CREATE INDEX IF NOT EXISTS idx_color_palettes_default ON color_palettes(is_default, is_active);

-- Add foreign key constraint for color palettes after table creation
ALTER TABLE chart_display_configs 
ADD CONSTRAINT fk_chart_display_configs_color_palette 
FOREIGN KEY (default_color_palette_id) REFERENCES color_palettes(palette_id);

SELECT 'Chart configuration tables created successfully' as result;


-- Main data source registry for analytics
CREATE TABLE IF NOT EXISTS chart_data_sources (
    data_source_id SERIAL PRIMARY KEY,
    data_source_name VARCHAR(100) NOT NULL,
    data_source_description TEXT,
    table_name VARCHAR(100) NOT NULL,
    schema_name VARCHAR(50) NOT NULL,
    database_type VARCHAR(50) DEFAULT 'postgresql',
    connection_config JSONB,
    is_active BOOLEAN DEFAULT true,
    requires_auth BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(user_id)
);

-- Column metadata and properties for each data source
CREATE TABLE IF NOT EXISTS chart_data_source_columns (
    column_id SERIAL PRIMARY KEY,
    data_source_id INTEGER REFERENCES chart_data_sources(data_source_id) ON DELETE CASCADE,
    column_name VARCHAR(100) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    column_description TEXT,
    data_type VARCHAR(50) NOT NULL,
    
    -- Chart functionality flags
    is_filterable BOOLEAN DEFAULT false,
    is_groupable BOOLEAN DEFAULT false,
    is_measure BOOLEAN DEFAULT false,
    is_dimension BOOLEAN DEFAULT false,
    is_date_field BOOLEAN DEFAULT false,
    
    -- Display and formatting
    format_type VARCHAR(50),
    sort_order INTEGER DEFAULT 0,
    default_aggregation VARCHAR(20),
    
    -- Security and validation
    is_sensitive BOOLEAN DEFAULT false,
    access_level VARCHAR(20) DEFAULT 'all',
    allowed_values JSONB,
    validation_rules JSONB,
    
    -- Metadata
    example_value TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(data_source_id, column_name)
);

-- Chart display configurations
CREATE TABLE IF NOT EXISTS chart_display_configs (
    config_id SERIAL PRIMARY KEY,
    chart_type VARCHAR(50) NOT NULL,
    frequency VARCHAR(20),
    
    -- Chart.js configuration
    x_axis_config JSONB,
    y_axis_config JSONB,
    
    -- Display settings
    default_width INTEGER DEFAULT 800,
    default_height INTEGER DEFAULT 400,
    padding_config JSONB,
    
    -- Time axis settings
    time_unit VARCHAR(20),
    time_display_format VARCHAR(50),
    time_tooltip_format VARCHAR(50),
    
    -- Chart options
    show_legend BOOLEAN DEFAULT true,
    show_tooltips BOOLEAN DEFAULT true,
    enable_animation BOOLEAN DEFAULT true,
    
    -- Color settings
    default_color_palette_id INTEGER,
    
    is_default BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(chart_type, frequency)
);

-- Color palettes
CREATE TABLE IF NOT EXISTS color_palettes (
    palette_id SERIAL PRIMARY KEY,
    palette_name VARCHAR(100) NOT NULL,
    palette_description TEXT,
    colors JSONB NOT NULL,
    
    -- Usage context
    palette_type VARCHAR(50) DEFAULT 'general',
    max_colors INTEGER,
    
    -- Accessibility
    is_colorblind_safe BOOLEAN DEFAULT false,
    contrast_ratio DECIMAL(3,2),
    
    -- Metadata
    is_default BOOLEAN DEFAULT false,
    is_system BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(user_id)
);

-- Chart component configurations
CREATE TABLE IF NOT EXISTS chart_component_configs (
    component_config_id SERIAL PRIMARY KEY,
    component_name VARCHAR(100) NOT NULL,
    chart_type VARCHAR(50) NOT NULL,
    
    -- Component settings
    default_props JSONB,
    style_overrides JSONB,
    feature_flags JSONB,
    
    -- Performance settings
    max_data_points INTEGER DEFAULT 1000,
    enable_virtualization BOOLEAN DEFAULT false,
    lazy_loading BOOLEAN DEFAULT false,
    
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(component_name, chart_type)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_chart_data_sources_active ON chart_data_sources(is_active);
CREATE INDEX IF NOT EXISTS idx_chart_data_source_columns_data_source ON chart_data_source_columns(data_source_id);
CREATE INDEX IF NOT EXISTS idx_chart_data_source_columns_flags ON chart_data_source_columns(is_filterable, is_groupable, is_measure);
CREATE INDEX IF NOT EXISTS idx_chart_display_configs_type_freq ON chart_display_configs(chart_type, frequency);
CREATE INDEX IF NOT EXISTS idx_color_palettes_default ON color_palettes(is_default, is_active);

-- Add foreign key constraint for color palettes after table creation
ALTER TABLE chart_display_configs 
ADD CONSTRAINT fk_chart_display_configs_color_palette 
FOREIGN KEY (default_color_palette_id) REFERENCES color_palettes(palette_id);

SELECT 'Chart configuration tables created successfully' as result;
