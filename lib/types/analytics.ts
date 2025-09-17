/**
 * Analytics Types
 * Based on the ih.gr_app_measures table structure from the design document
 */

/**
 * Pre-aggregated measure record from ih.agg_app_measures table
 * Simplified structure with pre-calculated aggregations
 */
export interface AggAppMeasure {
  practice: string; // Practice name/identifier
  practice_primary: string; // Primary practice identifier
  practice_uid: number; // Practice UID for filtering
  provider_name: string; // Provider name
  measure: string; // What we're measuring (e.g., "Charges by Provider", "Payments by Provider")
  frequency: string; // Time unit ("Monthly", "Weekly", "Quarterly")
  date_index: string; // Date field for filtering and X-axis (ISO date string)
  measure_value: number; // The actual numeric value
  measure_type: string; // Type of measure ("currency", "count", etc.)
}

/**
 * Supported measure types from the actual data in ih.agg_app_measures
 */
export type MeasureType = 
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
  table: string; // e.g., "ih.agg_app_measures"
  filters: ChartFilter[];
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
  chart_definition: Omit<ChartDefinition, 'chart_definition_id' | 'created_by' | 'created_at' | 'updated_at'>;
  is_system_template: boolean;
}
