/**
 * Analytics Types
 * Based on the ih.gr_app_measures table structure from the design document
 */

/**
 * Pre-aggregated measure record from analytics tables
 * Semi-dynamic structure - common fields defined, additional fields dynamic
 */
export interface AggAppMeasure {
  // Core required fields that exist in all data sources
  date_index: string; // Date field for filtering and X-axis (ISO date string)
  measure_value: number; // The actual numeric value
  measure_type: string; // Type of measure ("currency", "count", etc.)

  // Common fields from standard data sources (may not exist in all sources)
  practice?: string; // Practice name/identifier
  practice_primary?: string; // Primary practice identifier
  practice_uid?: number; // Practice UID for filtering
  provider_name?: string; // Provider name
  entity_name?: string; // Entity name for grouping
  measure?: string; // What we're measuring
  frequency?: string; // Time unit ("Monthly", "Weekly", "Quarterly")

  // Multiple series metadata (added dynamically for multi-series queries)
  series_id?: string;
  series_label?: string;
  series_aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max';
  series_color?: string;

  // All other fields are dynamic based on data source columns
  // This allows grouping by any field marked as is_groupable in the database
  [key: string]: string | number | undefined;
}

/**
 * Standard measure record for ih.agg_app_measures table
 * Extended interface for backward compatibility and type safety
 * Use this when you know you're working with the standard data source
 */
export interface StandardAggAppMeasure extends AggAppMeasure {
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
}

export interface ChartFilter {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'like' | 'between';
  value: ChartFilterValue;
}

export type ChartFilterValue =
  | string
  | number
  | string[] // for 'in'/'not_in' operators
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
    | 'table';
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
 * Chart rendering context
 */
export interface ChartRenderContext {
  user_id: string;
  accessible_practices: string[];
  accessible_providers: string[];
  roles: string[];
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
  created_by: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  is_published?: boolean;
  is_default?: boolean;
}

export interface DashboardLayoutConfig {
  columns: number;
  rowHeight: number;
  margin: number;
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
