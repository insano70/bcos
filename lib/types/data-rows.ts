/**
 * Data Row Types
 *
 * Specific, strongly-typed interfaces for analytics data rows.
 * Replaces generic Record<string, unknown> patterns with domain-specific types.
 *
 * These types provide:
 * - Type safety for data transformation
 * - IntelliSense support for developers
 * - Compile-time error detection
 * - Clear documentation of data shapes
 */

/**
 * Base analytics row with common fields
 * All analytics data rows share these common properties
 */
export interface BaseAnalyticsRow {
  /** Unique identifier for the record (if applicable) */
  id?: string | number;
  /** Practice unique identifier */
  practice_uid?: number;
  /** Provider unique identifier */
  provider_uid?: number;
  /** Date value (ISO format or date string) */
  date_value?: string;
  /** Date index for time-series data */
  date_index?: string;
}

/**
 * Measure-based analytics row
 * Used for aggregated measure data (charges, payments, etc.)
 */
export interface MeasureRow extends BaseAnalyticsRow {
  /** The type of measure (e.g., 'Charges by Provider') */
  measure_type?: string;
  /** Numeric value of the measure */
  numeric_value?: number;
  /** Alternative: measure_value column name */
  measure_value?: number;
  /** Time period/frequency (Monthly, Weekly, Quarterly) */
  time_period?: string;
  /** Alternative: frequency column name */
  frequency?: string;
  /** Practice name for display */
  practice_name?: string;
  /** Provider name for display */
  provider_name?: string;
}

/**
 * Table-based analytics row
 * Used for generic table data from data sources
 */
export type TableRow = Record<string, string | number | boolean | null | undefined>;

/**
 * Chart data point after transformation
 * Used as output from chart transformers
 */
export interface ChartDataPoint {
  /** Label for the data point (x-axis) */
  label: string;
  /** Numeric value (y-axis) */
  value: number;
  /** Optional grouping category */
  group?: string;
  /** Optional raw value before formatting */
  rawValue?: number;
}

/**
 * Grouped chart data
 * Used for multi-series charts
 */
export interface GroupedChartData {
  /** Group/series identifier */
  groupId: string;
  /** Display label for the group */
  groupLabel: string;
  /** Data points in this group */
  dataPoints: ChartDataPoint[];
}

/**
 * Time series data point
 * Used for line/area charts with date axis
 */
export interface TimeSeriesDataPoint {
  /** Date value (ISO format) */
  date: string;
  /** Numeric value */
  value: number;
  /** Optional: series identifier for multi-series */
  seriesId?: string;
  /** Optional: formatted date for display */
  displayDate?: string;
}

/**
 * Progress bar data item
 * Used for progress-bar chart type
 */
export interface ProgressBarDataItem {
  /** Label for the progress bar */
  label: string;
  /** Current value */
  value: number;
  /** Percentage completion (0-100) */
  percentage: number;
  /** Optional: target value */
  target?: number;
  /** Optional: color override */
  color?: string;
}

/**
 * Number/metric chart data
 * Used for single-value metric displays
 */
export interface MetricData {
  /** The aggregated value */
  value: number;
  /** Measure type for formatting (currency, count, percentage) */
  measureType: string;
  /** Optional: previous period value for comparison */
  previousValue?: number;
  /** Optional: target value */
  target?: number;
  /** Optional: aggregation type used */
  aggregationType?: 'sum' | 'avg' | 'count' | 'min' | 'max';
}

/**
 * Table cell data after formatting
 * Used for table chart cells with display formatting
 */
export interface FormattedTableCell {
  /** Formatted display value */
  formatted: string;
  /** Raw value for sorting/export */
  raw: string | number | boolean | null;
  /** Optional icon configuration */
  icon?: {
    name: string;
    color?: string;
    type?: string;
  };
}

/**
 * Table column metadata
 * Used for table chart column definitions
 */
export interface TableColumnMeta {
  /** Column name in data source */
  columnName: string;
  /** Display name for header */
  displayName: string;
  /** Data type (string, number, date, etc.) */
  dataType: 'string' | 'number' | 'integer' | 'date' | 'datetime' | 'boolean' | 'currency' | 'percentage';
  /** Format type for rendering */
  formatType?: string | null;
  /** Whether to display an icon */
  displayIcon?: boolean;
  /** Icon type (if displayIcon is true) */
  iconType?: string | null;
  /** Icon color mode (static, dynamic, etc.) */
  iconColorMode?: string | null;
  /** Static icon color (if iconColorMode is 'static') */
  iconColor?: string | null;
  /** Icon mapping for dynamic icons */
  iconMapping?: Record<string, { icon: string; color: string }> | null;
  /** Whether column is sortable */
  sortable?: boolean;
  /** Whether column is filterable */
  filterable?: boolean;
  /** Column width (pixels or percentage) */
  width?: number | string;
}

/**
 * Dual-axis chart data
 * Used for combo charts with two y-axes
 */
export interface DualAxisChartData {
  /** Labels for x-axis */
  labels: string[];
  /** Primary axis dataset */
  primary: {
    label: string;
    data: number[];
    type: 'bar';
    measureType?: string;
  };
  /** Secondary axis dataset */
  secondary: {
    label: string;
    data: number[];
    type: 'line' | 'bar';
    measureType?: string;
  };
}

/**
 * Dashboard filter state
 * Used to track active filters on a dashboard
 */
export interface DashboardFilterState {
  /** Date range start (ISO format) */
  startDate?: string;
  /** Date range end (ISO format) */
  endDate?: string;
  /** Date range preset name */
  dateRangePreset?: string;
  /** Selected organization ID */
  organizationId?: string;
  /** Selected practice UIDs (resolved from organization) */
  practiceUids?: number[];
  /** Provider filter */
  providerName?: string;
  /** Measure filter */
  measure?: string;
  /** Frequency filter */
  frequency?: string;
}

/**
 * Type guard: Check if a row is a MeasureRow
 */
export function isMeasureRow(row: BaseAnalyticsRow): row is MeasureRow {
  return (
    'measure_type' in row ||
    'numeric_value' in row ||
    'measure_value' in row ||
    'time_period' in row
  );
}

/**
 * Type guard: Check if data is a FormattedTableCell
 */
export function isFormattedTableCell(value: unknown): value is FormattedTableCell {
  return (
    typeof value === 'object' &&
    value !== null &&
    'formatted' in value &&
    'raw' in value &&
    typeof (value as FormattedTableCell).formatted === 'string'
  );
}

/**
 * Type guard: Check if data is a ProgressBarDataItem
 */
export function isProgressBarDataItem(value: unknown): value is ProgressBarDataItem {
  return (
    typeof value === 'object' &&
    value !== null &&
    'label' in value &&
    'value' in value &&
    'percentage' in value &&
    typeof (value as ProgressBarDataItem).label === 'string' &&
    typeof (value as ProgressBarDataItem).value === 'number' &&
    typeof (value as ProgressBarDataItem).percentage === 'number'
  );
}

/**
 * Type guard: Check if data is MetricData
 */
export function isMetricData(value: unknown): value is MetricData {
  return (
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    'measureType' in value &&
    typeof (value as MetricData).value === 'number' &&
    typeof (value as MetricData).measureType === 'string'
  );
}

