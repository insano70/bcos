/**
 * Report Card Type Definitions
 *
 * Public types for report card data structures across all services.
 * Consolidates interfaces to prevent duplication and ensure consistency.
 */

// Re-export validation schema types for convenience
export type {
  FilterCriteriaInput,
  GenerateRequestInput,
  LocationComparisonQueryInput,
  MeasureCreateInput,
  MeasureParamsInput,
  MeasureQueryInput,
  MeasureUpdateInput,
  PeerComparisonQueryInput,
  ReportCardParamsInput,
  ReportCardQueryInput,
  SizeBucketConfigInput,
  TrendQueryInput,
} from '@/lib/validations/report-card';

// Re-export constant types
export type {
  FormatType,
  SizeBucket,
  TrendDirection,
  TrendPeriod,
} from '@/lib/constants/report-card';

/**
 * Report Card Result
 *
 * Complete report card with scores, trends, and insights for a practice.
 */
export interface ReportCard {
  result_id: string;
  practice_uid: number;
  organization_id: string | null;
  generated_at: string;
  overall_score: number;
  size_bucket: 'small' | 'medium' | 'large' | 'xlarge';
  percentile_rank: number;
  insights: string[];
  measure_scores: Record<string, MeasureScore>;
}

/**
 * Individual Measure Score
 *
 * Score details for a single measure within a report card.
 */
export interface MeasureScore {
  score: number;
  value: number;
  trend: 'improving' | 'declining' | 'stable';
  trend_percentage: number;
  percentile: number;
  peer_average: number;
}

/**
 * Practice Trend
 *
 * Trend data for a specific measure over a time period.
 */
export interface PracticeTrend {
  trend_id: number;
  practice_uid: number;
  measure_name: string;
  trend_period: '3_month' | '6_month' | '9_month';
  trend_direction: 'improving' | 'declining' | 'stable';
  trend_percentage: number;
  calculated_at: string;
}

/**
 * Peer Comparison
 *
 * Aggregate statistics for peer comparison within a size bucket.
 */
export interface PeerComparison {
  size_bucket: 'small' | 'medium' | 'large' | 'xlarge';
  practice_count: number;
  averages: Record<string, number>;
  percentiles: Record<string, PercentileBreakdown>;
}

/**
 * Percentile Breakdown
 *
 * Standard percentile values for distribution analysis.
 */
export interface PercentileBreakdown {
  p25: number;
  p50: number;
  p75: number;
}

/**
 * Location Comparison
 *
 * Comparison of metrics across locations within a practice.
 */
export interface LocationComparison {
  practice_uid: number;
  locations: LocationMetrics[];
  practice_totals: Record<string, number>;
}

/**
 * Location Metrics
 *
 * Metrics for a single location with ranking.
 */
export interface LocationMetrics {
  location: string;
  metrics: Record<string, number>;
  rank: number;
}

/**
 * Filter Criteria
 *
 * Key-value pairs for filtering analytics data.
 * Used to build WHERE clauses for measure collection.
 * e.g., { "measure": "Visits", "entity_name": "New Patient" }
 */
export type FilterCriteria = Record<string, string>;

/**
 * Measure Configuration
 *
 * Admin-configurable measure settings including weight, display options,
 * and filter criteria for dynamic SQL generation.
 */
export interface MeasureConfig {
  measure_id: number;
  measure_name: string;
  display_name: string;
  weight: number;
  is_active: boolean;
  higher_is_better: boolean;
  format_type: 'number' | 'currency' | 'percentage';
  /** Reference to chart_data_sources for schema awareness */
  data_source_id: number | null;
  /** Column to aggregate (SUM), defaults to 'numeric_value' */
  value_column: string;
  /** Filter criteria for WHERE clause, e.g., {"measure": "Visits", "entity_name": "New Patient"} */
  filter_criteria: FilterCriteria;
  created_at: string;
  updated_at: string;
}

/**
 * Practice Size Bucket Assignment
 *
 * Size bucket assignment with supporting metrics.
 */
export interface PracticeSizeBucket {
  bucket_id: number;
  practice_uid: number;
  organization_id: string | null;
  size_bucket: 'small' | 'medium' | 'large' | 'xlarge';
  monthly_charges_avg: number;
  percentile: number;
  calculated_at: string;
}

/**
 * Statistics Entry
 *
 * Single aggregated metric value for a practice.
 */
export interface StatisticsEntry {
  statistic_id: number;
  practice_uid: number;
  organization_id: string | null;
  measure_name: string;
  time_period: string;
  period_date: string;
  value: number;
  collected_at: string;
}

/**
 * Size Bucket Configuration
 *
 * Percentile threshold configuration for size bucket assignment.
 */
export interface SizeBucketConfig {
  small_max_percentile: number;
  medium_max_percentile: number;
  large_max_percentile: number;
}

/**
 * Generation Result
 *
 * Result summary from a report card generation run.
 */
export interface GenerationResult {
  success: boolean;
  practicesProcessed: number;
  cardsGenerated: number;
  errors: GenerationError[];
  duration: number;
}

/**
 * Generation Error
 *
 * Error details from a failed generation attempt.
 */
export interface GenerationError {
  practiceUid: number;
  error: string;
  code: string;
}

/**
 * Collection Result
 *
 * Result summary from a statistics collection run.
 */
export interface CollectionResult {
  practicesProcessed: number;
  recordsInserted: number;
  recordsUpdated: number;
  duration: number;
}

/**
 * Trend Analysis Result
 *
 * Result summary from a trend analysis run.
 */
export interface TrendAnalysisResult {
  practicesProcessed: number;
  trendsCalculated: number;
  duration: number;
}

/**
 * Sizing Result
 *
 * Result summary from a practice sizing run.
 */
export interface SizingResult {
  practicesProcessed: number;
  bucketCounts: Record<'small' | 'medium' | 'large' | 'xlarge', number>;
  duration: number;
}
