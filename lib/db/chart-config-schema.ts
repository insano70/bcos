import { pgTable, integer, varchar, text, boolean, timestamp, jsonb, index, decimal, uuid } from 'drizzle-orm/pg-core';

/**
 * Chart Configuration Schema
 * Database-driven configuration system to replace all hardcoded settings
 */

// Main data source registry for analytics
export const chart_data_sources = pgTable(
  'chart_data_sources',
  {
    data_source_id: integer('data_source_id').primaryKey().generatedByDefaultAsIdentity(),
    data_source_name: varchar('data_source_name', { length: 100 }).notNull(),
    data_source_description: text('data_source_description'),
    table_name: varchar('table_name', { length: 100 }).notNull(),
    schema_name: varchar('schema_name', { length: 50 }).notNull(),
    database_type: varchar('database_type', { length: 50 }).default('postgresql'),
    connection_config: jsonb('connection_config'),
    is_active: boolean('is_active').default(true),
    requires_auth: boolean('requires_auth').default(true),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    created_by: uuid('created_by'),
  },
  (table) => ({
    activeIdx: index('idx_chart_data_sources_active').on(table.is_active),
    tableNameIdx: index('idx_chart_data_sources_table').on(table.table_name),
  })
);

// Column metadata and properties for each data source
export const chart_data_source_columns = pgTable(
  'chart_data_source_columns',
  {
    column_id: integer('column_id').primaryKey().generatedByDefaultAsIdentity(),
    data_source_id: integer('data_source_id').references(() => chart_data_sources.data_source_id, { onDelete: 'cascade' }).notNull(),
    column_name: varchar('column_name', { length: 100 }).notNull(),
    display_name: varchar('display_name', { length: 100 }).notNull(),
    column_description: text('column_description'),
    data_type: varchar('data_type', { length: 50 }).notNull(),
    
    // Chart functionality flags
    is_filterable: boolean('is_filterable').default(false),
    is_groupable: boolean('is_groupable').default(false),
    is_measure: boolean('is_measure').default(false),
    is_dimension: boolean('is_dimension').default(false),
    is_date_field: boolean('is_date_field').default(false),
    is_measure_type: boolean('is_measure_type').default(false),
    is_time_period: boolean('is_time_period').default(false),
    
    // Display and formatting
    format_type: varchar('format_type', { length: 50 }),
    sort_order: integer('sort_order').default(0),
    default_aggregation: varchar('default_aggregation', { length: 20 }),
    
    // Security and validation
    is_sensitive: boolean('is_sensitive').default(false),
    access_level: varchar('access_level', { length: 20 }).default('all'),
    allowed_values: jsonb('allowed_values'),
    validation_rules: jsonb('validation_rules'),
    
    // Metadata
    example_value: text('example_value'),
    is_active: boolean('is_active').default(true),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    dataSourceIdx: index('idx_chart_data_source_columns_data_source').on(table.data_source_id),
    flagsIdx: index('idx_chart_data_source_columns_flags').on(table.is_filterable, table.is_groupable, table.is_measure, table.is_measure_type),
    activeIdx: index('idx_chart_data_source_columns_active').on(table.is_active),
    uniqueColumn: index('idx_chart_data_source_columns_unique').on(table.data_source_id, table.column_name),
  })
);

// Chart display configurations
export const chart_display_configurations = pgTable(
  'chart_display_configurations',
  {
    display_configuration_id: integer('display_configuration_id').primaryKey().generatedByDefaultAsIdentity(),
    chart_type: varchar('chart_type', { length: 50 }).notNull(),
    frequency: varchar('frequency', { length: 20 }),
    
    // Chart.js axis configuration
    x_axis_config: jsonb('x_axis_config'),
    y_axis_config: jsonb('y_axis_config'),
    
    // Display settings
    default_width: integer('default_width').default(800),
    default_height: integer('default_height').default(400),
    padding_config: jsonb('padding_config'),
    
    // Time axis settings
    time_unit: varchar('time_unit', { length: 20 }),
    time_display_format: varchar('time_display_format', { length: 50 }),
    time_tooltip_format: varchar('time_tooltip_format', { length: 50 }),
    
    // Chart options
    show_legend: boolean('show_legend').default(true),
    show_tooltips: boolean('show_tooltips').default(true),
    enable_animation: boolean('enable_animation').default(true),
    
    default_color_palette_id: integer('default_color_palette_id').references(() => color_palettes.palette_id),
    
    is_default: boolean('is_default').default(false),
    is_active: boolean('is_active').default(true),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    typeFreqIdx: index('idx_chart_display_configurations_type_freq').on(table.chart_type, table.frequency),
    defaultIdx: index('idx_chart_display_configurations_default').on(table.is_default),
    activeIdx: index('idx_chart_display_configurations_active').on(table.is_active),
  })
);

// Color palettes
export const color_palettes = pgTable(
  'color_palettes',
  {
    palette_id: integer('palette_id').primaryKey().generatedByDefaultAsIdentity(),
    palette_name: varchar('palette_name', { length: 100 }).notNull(),
    palette_description: text('palette_description'),
    colors: jsonb('colors').notNull(),
    
    // Usage context
    palette_type: varchar('palette_type', { length: 50 }).default('general'),
    max_colors: integer('max_colors'),
    
    // Accessibility
    is_colorblind_safe: boolean('is_colorblind_safe').default(false),
    contrast_ratio: decimal('contrast_ratio', { precision: 3, scale: 2 }),
    
    // Metadata
    is_default: boolean('is_default').default(false),
    is_system: boolean('is_system').default(false),
    is_active: boolean('is_active').default(true),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    created_by: uuid('created_by'),
  },
  (table) => ({
    defaultIdx: index('idx_color_palettes_default').on(table.is_default, table.is_active),
    typeIdx: index('idx_color_palettes_type').on(table.palette_type),
    systemIdx: index('idx_color_palettes_system').on(table.is_system),
  })
);

// Chart component configurations table removed - was not being used in the application
