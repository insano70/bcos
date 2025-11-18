/**
 * Data Sources Type Definitions
 *
 * Shared types for data sources and columns across all services.
 * Consolidates interfaces to prevent duplication and ensure consistency.
 */

// Re-export validation schema types for convenience
export type {
  DataSourceColumnCreateInput,
  DataSourceColumnQueryInput,
  DataSourceColumnUpdateInput,
  DataSourceCreateInput,
  DataSourceQueryInput,
  DataSourceUpdateInput,
  TableColumnsQueryInput,
} from '@/lib/validations/data-sources';

/**
 * Convenient type aliases using validation schema types
 */
export type CreateDataSourceData = import('@/lib/validations/data-sources').DataSourceCreateInput;
export type UpdateDataSourceData = import('@/lib/validations/data-sources').DataSourceUpdateInput;
export type DataSourceQueryOptions =
  import('@/lib/validations/data-sources').DataSourceQueryInput;
export type CreateDataSourceColumnData =
  import('@/lib/validations/data-sources').DataSourceColumnCreateInput;
export type UpdateDataSourceColumnData =
  import('@/lib/validations/data-sources').DataSourceColumnUpdateInput;
export type DataSourceColumnQueryOptions =
  import('@/lib/validations/data-sources').DataSourceColumnQueryInput;

/**
 * Data Source Column with Full Metadata
 *
 * Complete column definition including chart functionality flags,
 * display settings, icon configuration, and security settings.
 */
export interface DataSourceColumnWithMetadata {
  column_id: number;
  data_source_id: number;
  column_name: string;
  display_name: string;
  column_description: string | null;
  data_type: string;

  // Chart functionality flags
  is_filterable: boolean | null;
  is_groupable: boolean | null;
  is_measure: boolean | null;
  is_dimension: boolean | null;
  is_date_field: boolean | null;
  is_measure_type: boolean | null;
  is_time_period: boolean | null;
  is_expansion_dimension: boolean | null;
  expansion_display_name: string | null;

  // Display and formatting
  format_type: string | null;
  sort_order: number | null;
  default_aggregation: string | null;

  // Icon display options
  display_icon: boolean | null;
  icon_type: string | null;
  icon_color_mode: string | null;
  icon_color: string | null;
  icon_mapping: unknown;

  // Security and validation
  is_sensitive: boolean | null;
  access_level: string | null;
  allowed_values: unknown;
  validation_rules: unknown;

  // Metadata
  example_value: string | null;
  is_active: boolean | null;
  created_at: Date | null;
  updated_at: Date | null;
}

/**
 * Data Source with Full Metadata
 *
 * Data source configuration with enriched metadata like column count.
 */
export interface DataSourceWithMetadata {
  data_source_id: number;
  data_source_name: string;
  data_source_description: string | null;
  table_name: string;
  schema_name: string;
  database_type: string | null;
  connection_config: unknown;
  is_active: boolean | null;
  requires_auth: boolean | null;
  created_at: Date | null;
  updated_at: Date | null;
  created_by: string | null;
  column_count?: number;
  last_tested?: Date | null;
}

/**
 * Connection Test Result
 *
 * Result from testing connectivity to a data source.
 */
export interface ConnectionTestResult {
  success: boolean;
  error?: string;
  details?: {
    connection_time_ms?: number;
    schema_accessible?: boolean;
    table_accessible?: boolean;
    sample_row_count?: number;
  };
}

/**
 * Table Column Information
 *
 * Column metadata retrieved from information_schema.
 */
export interface TableColumn {
  column_name: string;
  data_type: string;
  is_nullable: boolean;
  column_default: string | null;
  ordinal_position: number;
}

/**
 * Column Characteristics Detection Result
 *
 * Intelligent type detection results for auto-configuration.
 */
export interface ColumnCharacteristics {
  isDateField: boolean;
  isMeasure: boolean;
  isDimension: boolean;
  isMeasureType: boolean;
  isTimePeriod: boolean;
  isFilterable: boolean;
  isGroupable: boolean;
}
