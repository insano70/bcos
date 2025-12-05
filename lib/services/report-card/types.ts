/**
 * Report Card Service Internal Types
 *
 * Types used internally by report card services.
 * Public types are in @/lib/types/report-card.ts
 */

/**
 * Raw statistics row from analytics database (ih.agg_chart_data)
 * Query filters ensure practice_uid and numeric_value are NOT NULL
 */
export interface AnalyticsStatisticsRow {
  practice_uid: number;
  measure: string;
  time_period: string;
  date_value: string;
  numeric_value: number | string;
}

/**
 * Options for statistics collection
 */
export interface CollectionOptions {
  practiceUid?: number | undefined;
  force?: boolean | undefined;
}

/**
 * Options for trend analysis
 */
export interface TrendAnalysisOptions {
  practiceUid?: number | undefined;
}

/**
 * Options for practice sizing
 */
export interface SizingOptions {
  thresholds?: {
    small: number;
    medium: number;
    large: number;
  } | undefined;
}

/**
 * Options for report card generation
 */
export interface GenerationOptions {
  practiceUid?: number | undefined;
  force?: boolean | undefined;
  /** Target month for historical generation (e.g., "2024-01-01") */
  targetMonth?: string | undefined;
  /** Generate for all historical months (last N months) */
  historical?: boolean | undefined;
  /** Number of historical months to generate (default 24) */
  historicalMonths?: number | undefined;
}

/**
 * Internal trend calculation result
 */
export interface TrendCalculation {
  practiceUid: number;
  measureName: string;
  trendPeriod: '3_month' | '6_month' | '9_month';
  direction: 'improving' | 'declining' | 'stable';
  percentageChange: number;
}

/**
 * Internal scoring result for a single measure
 */
export interface MeasureScoringResult {
  measureName: string;
  rawValue: number;
  normalizedScore: number;
  /** Percentile rank (0-100) or null if insufficient peers (<2) */
  percentileRank: number | null;
  peerAverage: number;
  /** Number of peers used for comparison (excludes current practice) */
  peerCount: number;
  trend: 'improving' | 'declining' | 'stable';
  trendPercentage: number;
}

/**
 * Internal insight generation input
 */
export interface InsightInput {
  measureName: string;
  displayName: string;
  score: number;
  trend: 'improving' | 'declining' | 'stable';
  trendPercentage: number;
  percentile: number;
  higherIsBetter: boolean;
}

/**
 * Practice charges data for sizing
 */
export interface PracticeChargesData {
  practiceUid: number;
  organizationId: string | null;
  avgMonthlyCharges: number;
}

/**
 * Location metrics from analytics database
 */
export interface LocationMetricsRow {
  practice_uid: number;
  location: string;
  measure: string;
  measure_value: number | string;
}

/**
 * Measure configuration with filter criteria for dynamic SQL generation
 */
export interface MeasureWithFilters {
  measure_id: number;
  measure_name: string;
  display_name: string;
  weight: number;
  is_active: boolean;
  higher_is_better: boolean;
  format_type: string;
  data_source_id: number | null;
  value_column: string;
  filter_criteria: Record<string, string>;
}

/**
 * Aggregated statistics row for a measure (from dynamic query)
 */
export interface MeasureStatisticsRow {
  practice_uid: number;
  time_period: string;
  date_value: string;
  numeric_value: number | string;
}
