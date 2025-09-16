/**
 * Analytics Types
 * Based on the ih.gr_app_measures table structure from the design document
 */

/**
 * Raw measure record from ih.gr_app_measures table
 * Contains 15,603 records with practice/provider performance data
 */
export interface AppMeasure {
  practice_uid: string;
  provider_uid?: string;
  measure: string; // e.g., "Charges by Practice", "Payments by Practice", "Charges by Provider", "Payments by Provider"
  measure_format: string; // Data format/type
  period_based_on: string; // What the period is based on
  frequency: string; // "Monthly", "Weekly", "Quarterly"
  period_start: string; // Period start date (ISO string)
  period_end: string; // Period end date (ISO string)
  date_index: number; // Numeric index for ordering
  measure_value: number; // Primary metric value
  last_period_value?: number; // Previous period value for comparison
  last_year_value?: number; // Same period last year value
  pct_change_vs_last_period?: number; // Percentage change vs last period
  pct_change_vs_last_year?: number; // Percentage change vs last year
}

/**
 * Supported measure types from the data
 */
export type MeasureType = 
  | 'Charges by Practice'
  | 'Payments by Practice' 
  | 'Charges by Provider'
  | 'Payments by Provider';

/**
 * Supported frequency types
 */
export type FrequencyType = 'Monthly' | 'Weekly' | 'Quarterly';

/**
 * Chart configuration types based on the design document
 */

export interface ChartDataSourceConfig {
  table: string; // e.g., "ih.gr_app_measures"
  filters: ChartFilter[];
  groupBy: string[];
  orderBy: ChartOrderBy[];
  limit?: number;
}

export interface ChartFilter {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'not_in' | 'like' | 'between';
  value: any;
}

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
  chart_type: 'line' | 'bar' | 'pie' | 'doughnut' | 'area';
  chart_category_id?: number;
  created_by_user_id: string;
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
  labels: string[];
  datasets: ChartDataset[];
}

export interface ChartDataset {
  label: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string | string[];
  borderWidth?: number;
  fill?: boolean;
  tension?: number;
  pointRadius?: number;
  pointHoverRadius?: number;
  pointBackgroundColor?: string;
  pointHoverBackgroundColor?: string;
  pointBorderWidth?: number;
  pointHoverBorderWidth?: number;
  barPercentage?: number;
  categoryPercentage?: number;
  borderRadius?: number;
  hoverBackgroundColor?: string | string[];
  clip?: number;
}

/**
 * Analytics query parameters
 */
export interface AnalyticsQueryParams {
  measure?: MeasureType;
  frequency?: FrequencyType;
  practice_uid?: string | undefined;
  provider_uid?: string | undefined;
  start_date?: string | undefined;
  end_date?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

/**
 * Analytics query result with metadata
 */
export interface AnalyticsQueryResult {
  data: AppMeasure[];
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
  chart_definition: Omit<ChartDefinition, 'chart_definition_id' | 'created_by_user_id' | 'created_at' | 'updated_at'>;
  is_system_template: boolean;
}
