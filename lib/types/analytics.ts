/**
 * Analytics Types
 * Based on the ih.gr_app_measures table structure from the design document
 *
 * REFACTORED: Now supports dynamic column names via DataSourceColumnMapping
 * See: docs/DYNAMIC_COLUMN_REFACTORING_PLAN.md
 */

/**
 * Data source column mapping configuration
 * Defines how to access columns dynamically based on data source schema
 *
 * Example:
 * - Data Source 1: { dateField: "date_index", measureField: "measure_value", ... }
 * - Data Source 3: { dateField: "date_value", measureField: "numeric_value", ... }
 */
export interface DataSourceColumnMapping {
  /** Name of the date column (e.g., "date_value", "date_index") */
  dateField: string;

  /** Name of the measure value column (e.g., "numeric_value", "measure_value") */
  measureField: string;

  /** Name of the measure type column (e.g., "measure_type") */
  measureTypeField: string;

  /** Name of the time period/frequency column (e.g., "time_period", "frequency") */
  timePeriodField: string;

  /** Name of the practice UID column (optional, defaults to "practice_uid") */
  practiceField?: string;

  /** Name of the provider UID column (optional, defaults to "provider_uid") */
  providerField?: string;
}

/**
 * Type-safe accessor for dynamic measure fields
 *
 * Use this instead of direct property access to support multiple data sources
 * with different column names.
 *
 * @example
 * ```typescript
 * const mapping = await columnMappingService.getMapping(dataSourceId);
 * const accessor = new MeasureAccessor(row, mapping);
 *
 * // ✅ Dynamic access based on config
 * const date = accessor.getDate();
 * const value = accessor.getMeasureValue();
 *
 * // ❌ Don't do this (hardcoded)
 * const date = row.date_index;
 * const value = row.measure_value;
 * ```
 */
export class MeasureAccessor {
  constructor(
    private readonly row: AggAppMeasure,
    private readonly mapping: DataSourceColumnMapping
  ) {}

  /**
   * Get the date value from the row
   * Column name determined by mapping.dateField
   */
  getDate(): string {
    const value = this.row[this.mapping.dateField];
    if (typeof value !== 'string') {
      throw new Error(`Date field "${this.mapping.dateField}" is not a string`);
    }
    return value;
  }

  /**
   * Get the measure value from the row
   * Column name determined by mapping.measureField
   */
  getMeasureValue(): number {
    const value = this.row[this.mapping.measureField];
    if (typeof value === 'string') {
      return parseFloat(value);
    }
    if (typeof value !== 'number') {
      throw new Error(`Measure field "${this.mapping.measureField}" is not a number`);
    }
    return value;
  }

  /**
   * Get the measure type from the row (e.g., "currency", "count", "percentage")
   * Column name determined by mapping.measureTypeField
   */
  getMeasureType(): string {
    const value = this.row[this.mapping.measureTypeField];
    if (typeof value !== 'string') {
      return 'number'; // Default fallback
    }
    return value;
  }

  /**
   * Get the time period/frequency from the row (e.g., "Monthly", "Weekly")
   * Column name determined by mapping.timePeriodField
   */
  getTimePeriod(): string | undefined {
    const value = this.row[this.mapping.timePeriodField];
    return typeof value === 'string' ? value : undefined;
  }

  /**
   * Get the practice UID from the row
   * Column name determined by mapping.practiceField or defaults to "practice_uid"
   */
  getPracticeUid(): number | undefined {
    const fieldName = this.mapping.practiceField || 'practice_uid';
    const value = this.row[fieldName];
    if (typeof value === 'string') {
      return parseInt(value, 10);
    }
    return typeof value === 'number' ? value : undefined;
  }

  /**
   * Get the provider UID from the row
   * Column name determined by mapping.providerField or defaults to "provider_uid"
   */
  getProviderUid(): number | undefined {
    const fieldName = this.mapping.providerField || 'provider_uid';
    const value = this.row[fieldName];
    if (typeof value === 'string') {
      return parseInt(value, 10);
    }
    return typeof value === 'number' ? value : undefined;
  }

  /**
   * Generic accessor for any field in the row
   * Use this for grouping fields or other dynamic columns
   */
  get(fieldName: string): string | number | boolean | null | undefined {
    return this.row[fieldName];
  }

  /**
   * Get the underlying row data
   * Use sparingly - prefer typed accessors above
   */
  getRaw(): AggAppMeasure {
    return this.row;
  }
}

/**
 * Pre-aggregated measure record from analytics tables
 * FULLY DYNAMIC - column names determined by data source configuration
 *
 * ⚠️ BREAKING CHANGE: No longer has hardcoded `date_index`, `measure_value`, etc.
 * Use MeasureAccessor for type-safe access to dynamic columns.
 *
 * For legacy code, see LegacyAggAppMeasure (deprecated)
 */
export interface AggAppMeasure {
  // NO hardcoded column names
  // All fields are dynamic based on data source schema
  // Access via MeasureAccessor class or column mapping configuration

  // Metadata fields (added dynamically for multi-series queries)
  series_id?: string;
  series_label?: string;
  series_aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max';
  series_color?: string;

  // Index signature for all dynamic columns
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Legacy measure record with hardcoded column names
 *
 * @deprecated Use AggAppMeasure with MeasureAccessor instead
 *
 * This interface is maintained for backward compatibility during the migration
 * to dynamic column names. New code should use:
 * - AggAppMeasure for the data type
 * - MeasureAccessor for accessing fields
 * - DataSourceColumnMapping for configuration
 *
 * Will be removed in a future version.
 */
export interface LegacyAggAppMeasure extends AggAppMeasure {
  // Hardcoded column names from original schema
  date_index: string;
  measure_value: number;
  measure_type: string;

  // Common optional fields
  practice?: string;
  practice_primary?: string;
  practice_uid?: number;
  provider_name?: string;
  entity_name?: string;
  measure?: string;
  frequency?: string;
}

/**
 * Standard measure record for ih.agg_app_measures table
 *
 * @deprecated Use LegacyAggAppMeasure if you need hardcoded fields, or better yet, migrate to MeasureAccessor
 *
 * Extended interface for backward compatibility and type safety
 * Use this when you know you're working with the standard data source
 */
export interface StandardAggAppMeasure extends LegacyAggAppMeasure {
  // All fields from LegacyAggAppMeasure as required
  practice: string; // Practice name/identifier (required for standard)
  practice_primary: string; // Primary practice identifier (required for standard)
  practice_uid: number; // Practice UID for filtering (required for standard)
  provider_name: string; // Provider name (required for standard)
  measure: string; // What we're measuring (required for standard)
  frequency: string; // Time unit (required for standard)
}

/**
 * Supported measure types from the actual data in ih.agg_app_measures
 */
export type MeasureType = 'Charges by Provider' | 'Payments by Provider';

/**
 * Supported frequency types
 */
export type FrequencyType = 'Monthly' | 'Weekly' | 'Quarterly';

/**
 * Chart configuration types based on the design document
 */

export interface ChartDataSourceConfig {
  table: string; // e.g., "ih.agg_app_measures"
  filters: ChartFilter[];
  orderBy: ChartOrderBy[];
  limit?: number;
  advancedFilters?: ChartFilter[]; // Advanced filtering support
}

export interface ChartFilter {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'like' | 'between';
  value: ChartFilterValue;
}

export type ChartFilterValue =
  | string
  | number
  | string[] // for 'in'/'not_in' operators with string values
  | number[] // for 'in'/'not_in' operators with numeric values
  | [string | number, string | number]; // for 'between' operator

export interface ChartOrderBy {
  field: string;
  direction: 'ASC' | 'DESC';
}

export interface ChartAxisConfig {
  field: string;
  label: string;
  format: 'date' | 'currency' | 'number' | 'percentage' | 'string';
}

export interface ChartSeriesConfig {
  groupBy?: string;
  colorPalette: string;
}

export interface ChartDisplayOptions {
  responsive: boolean;
  showLegend: boolean;
  showTooltips: boolean;
  animation: boolean;
}

export interface ChartConfig {
  x_axis: ChartAxisConfig;
  y_axis: ChartAxisConfig;
  series?: ChartSeriesConfig;
  options: ChartDisplayOptions;
  colorPalette?: string;
  periodComparison?: PeriodComparisonConfig;
  // Extended configuration properties
  calculatedField?: string;
  dataSourceId?: number;
  stackingMode?: 'normal' | 'percentage';
  seriesConfigs?: MultipleSeriesConfig[];
  dualAxisConfig?: DualAxisConfig;
  aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max'; // For number charts
  target?: number; // For progress-bar and number charts
  [key: string]: unknown; // Allow additional properties for extensibility
}

export interface ChartAccessControl {
  roles: string[];
  practices: string[];
  providers: string[];
}

/**
 * Complete chart definition based on design document schema
 */
export interface ChartDefinition {
  chart_definition_id: string;
  chart_name: string;
  chart_description?: string;
  chart_type:
    | 'line'
    | 'bar'
    | 'stacked-bar'
    | 'horizontal-bar'
    | 'progress-bar'
    | 'pie'
    | 'doughnut'
    | 'area'
    | 'table'
    | 'dual-axis'
    | 'number';
  chart_category_id?: number;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  is_active: boolean;
  data_source: ChartDataSourceConfig;
  chart_config: ChartConfig;
  access_control?: ChartAccessControl;
}

/**
 * Chart.js compatible data structure
 */
export interface ChartData {
  labels: (string | Date)[];
  datasets: ChartDataset[];
  measureType?: string; // Global measure type for the chart (e.g., 'currency', 'count')
  // Phase 3.4: Progress bar chart colors
  colors?: readonly string[]; // Array of colors from palette for progress bars
}

export interface ChartDataset {
  label: string;
  data: number[];
  type?: 'line' | 'bar'; // Chart type for mixed charts (dual-axis)
  backgroundColor?: string | string[];
  borderColor?: string | string[];
  borderWidth?: number;
  fill?: boolean;
  tension?: number;
  pointRadius?: number;
  pointHoverRadius?: number;
  pointBackgroundColor?: string;
  pointBorderColor?: string; // Point border color for line charts
  measureType?: string; // Measure type specific to this dataset (e.g., 'currency', 'count')
  pointHoverBackgroundColor?: string;
  pointBorderWidth?: number;
  pointHoverBorderWidth?: number;
  barPercentage?: number;
  categoryPercentage?: number;
  borderRadius?: number;
  hoverBackgroundColor?: string | string[];
  clip?: number;
  yAxisID?: string; // Y-axis ID for dual-axis charts
  order?: number; // Draw order (lower = drawn first, higher = drawn on top)
  // Phase 3: Server-side metric aggregation
  aggregationType?: 'sum' | 'avg' | 'count' | 'min' | 'max'; // Aggregation type for metric charts
  rawValue?: number; // Raw aggregated value (for single-value progress bars)
  target?: number; // Target value (for progress bars)
  // Phase 3.4: Progress bar chart with multiple groups
  rawValues?: number[]; // Array of raw values for grouped progress bars (one per label)
  originalMeasureType?: string; // Original measure type before percentage conversion
}

/**
 * Multiple series configuration for charts
 */
export interface MultipleSeriesConfig {
  id: string;
  measure: MeasureType;
  aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max';
  label: string;
  color?: string;
}

/**
 * Period comparison configuration for charts
 */
export interface PeriodComparisonConfig {
  enabled: boolean;
  comparisonType: 'previous_period' | 'same_period_last_year' | 'custom_period';
  customPeriodOffset?: number; // For custom period comparisons (number of periods to go back)
  labelFormat: string; // Display label for comparison period (e.g., "Previous Month", "Last Quarter")
}

/**
 * Dual-axis configuration for combo charts (bar + line)
 */
export interface DualAxisConfig {
  enabled: boolean;
  primary: {
    measure: string;
    chartType: 'bar';
    axisLabel?: string;
    axisPosition: 'left';
  };
  secondary: {
    measure: string;
    chartType: 'line' | 'bar';
    axisLabel?: string;
    axisPosition: 'right';
  };
}

/**
 * Simplified analytics query parameters for pre-aggregated data
 */
export interface AnalyticsQueryParams {
  measure?: MeasureType;
  frequency?: FrequencyType;
  practice?: string | undefined;
  practice_primary?: string | undefined;
  practice_uid?: number | undefined;
  provider_uid?: number | undefined; // Added for cache integration
  provider_name?: string | undefined;
  start_date?: string | undefined;
  end_date?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  advanced_filters?: ChartFilter[] | undefined;
  calculated_field?: string | undefined;
  multiple_series?: MultipleSeriesConfig[] | undefined;
  data_source_id?: number | undefined;
  period_comparison?: PeriodComparisonConfig | undefined;
  nocache?: boolean | undefined; // Added for cache bypass
}

/**
 * Analytics query result with metadata
 */
export interface AnalyticsQueryResult {
  data: AggAppMeasure[];
  total_count: number;
  query_time_ms: number;
  cache_hit?: boolean;
}

/**
 * Chart rendering context with security filtering
 *
 * Used to apply row-level security to analytics queries based on user permissions.
 *
 * Security Model:
 * - accessible_practices: Array of practice_uid values (integers) from user's organizations
 * - accessible_providers: Array of provider_uid values (integers) for provider-level access
 * - Empty arrays mean different things based on permission_scope:
 *   - 'all' scope: Empty = no filtering (super admin)
 *   - 'organization' scope: Empty = fail-closed (no data)
 *   - 'own' scope: Uses accessible_providers instead
 */
export interface ChartRenderContext {
  user_id: string;

  // Security filters (integers matching analytics database columns)
  accessible_practices: number[]; // practice_uid values from organizations
  accessible_providers: number[]; // provider_uid values for provider-level filtering

  roles: string[];

  // Security metadata for audit logging
  permission_scope?: 'own' | 'organization' | 'all' | 'none';
  organization_ids?: string[]; // Organizations providing access (including hierarchy)
  includes_hierarchy?: boolean; // True if parent org includes child org data
  provider_uid?: number | null; // User's provider_uid (for analytics:read:own)
}

/**
 * Predefined chart templates for common use cases
 */
export interface ChartTemplate {
  template_id: string;
  template_name: string;
  template_description: string;
  chart_definition: Omit<
    ChartDefinition,
    'chart_definition_id' | 'created_by' | 'created_at' | 'updated_at'
  >;
  is_system_template: boolean;
}

/**
 * Chart list item for table display
 */
export interface ChartDefinitionListItem {
  id: string;
  chart_definition_id: string;
  chart_name: string;
  chart_description?: string | undefined;
  chart_type: 'line' | 'bar' | 'pie' | 'doughnut' | 'area';
  chart_category_id?: number | undefined;
  category_name?: string | undefined;
  created_by: string;
  creator_name?: string | undefined;
  creator_last_name?: string | undefined;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

/**
 * Dashboard definition types
 */
export interface Dashboard {
  dashboard_id: string;
  dashboard_name: string;
  dashboard_description?: string;
  layout_config: DashboardLayoutConfig;
  dashboard_category_id?: number;
  organization_id?: string; // undefined = universal, UUID = org-specific
  created_by: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  is_published?: boolean;
  is_default?: boolean;
}

export interface DashboardFilterConfig {
  enabled?: boolean; // Show filter bar (default: true)
  showDateRange?: boolean; // Show date range filter (default: true)
  showOrganization?: boolean; // Show organization filter (default: true)
  showPractice?: boolean; // Show practice filter (default: false)
  showProvider?: boolean; // Show provider filter (default: false)
  defaultFilters?: {
    // Default filter values
    dateRangePreset?: string;
    organizationId?: string;
  };
}

export interface DashboardLayoutConfig {
  columns: number;
  rowHeight: number;
  margin: number;
  filterConfig?: DashboardFilterConfig; // Phase 7: Universal filter configuration
  useBatchRendering?: boolean; // Phase 7: Enable batch rendering (default: true)
  [key: string]: unknown; // Allow additional properties for extensibility
}

export interface DashboardChart {
  dashboard_chart_id: string;
  dashboard_id: string;
  chart_definition_id: string;
  position_config: DashboardChartPosition;
  added_at: string;
}

export interface DashboardChartPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Dashboard list item for table display
 */
export interface DashboardListItem {
  id: string; // Added for DataTableEnhanced compatibility
  dashboard_id: string;
  dashboard_name: string;
  dashboard_description?: string | undefined;
  dashboard_category_id?: number | undefined;
  organization_id?: string | undefined; // undefined = universal, UUID = org-specific
  category_name?: string | undefined;
  chart_count: number;
  created_by: string;
  creator_name?: string | undefined;
  creator_last_name?: string | undefined;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  is_published?: boolean;
  is_default?: boolean;
}
