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
 * Monthly snapshots are stored, identified by report_card_month.
 */
export interface ReportCard {
  result_id: string;
  practice_uid: number;
  organization_id: string | null;
  /** The month this report card represents (ISO date string, e.g., "2025-11-01") */
  report_card_month: string;
  generated_at: string;
  overall_score: number;
  size_bucket: 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge';
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
  /** Percentile rank (0-100) or null if insufficient peers */
  percentile: number | null;
  peer_average: number;
  /** Number of peers used for comparison (excludes current practice) */
  peer_count: number;
}

/**
 * Previous Month Summary
 *
 * Summary of the previous month's report card for comparison display.
 */
export interface PreviousMonthSummary {
  /** Month label (e.g., "October 2025") */
  month: string;
  /** Overall score from previous month */
  score: number;
  /** Letter grade (e.g., "B+") */
  grade: string;
  /** Score change from previous month to current */
  scoreChange: number;
  /** Whether the grade improved */
  gradeImproved: boolean;
}

/**
 * Grade History Entry
 *
 * Single entry in the grade history table showing monthly performance.
 */
export interface GradeHistoryEntry {
  /** ISO date string for the month (e.g., "2025-11-01") */
  month: string;
  /** Formatted month label (e.g., "Nov 2025") */
  monthLabel: string;
  /** Overall score (0-100) */
  score: number;
  /** Letter grade (e.g., "B+") */
  grade: string;
  /** Percentile rank among peers */
  percentileRank: number;
  /** Size bucket at time of report card */
  sizeBucket: 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge';
  /** Score change from previous month (null if first entry) */
  scoreChange: number | null;
  /** Grade change direction (null if first entry) */
  gradeChange: 'up' | 'down' | 'same' | null;
}

/**
 * Monthly Score
 *
 * Score summary for a single month in annual review.
 */
export interface MonthlyScore {
  /** ISO date string for the month */
  month: string;
  /** Formatted month label */
  monthLabel: string;
  /** Overall score */
  score: number;
  /** Letter grade */
  grade: string;
  /** Percentile rank */
  percentileRank: number;
}

/**
 * Year Over Year Comparison
 *
 * Comparison of performance between two consecutive years.
 */
export interface YearOverYearComparison {
  /** Current calendar year */
  currentYear: number;
  /** Previous calendar year */
  previousYear: number;
  /** Average score for current year */
  currentYearAverage: number;
  /** Average score for previous year */
  previousYearAverage: number;
  /** Percentage change from previous to current year */
  changePercent: number;
  /** Grade for current year average */
  currentYearGrade: string;
  /** Grade for previous year average */
  previousYearGrade: string;
  /** Number of months compared */
  monthsCompared: number;
}

/**
 * Annual Forecast
 *
 * Projected performance based on recent trends.
 */
export interface AnnualForecast {
  /** Projected score for next period */
  projectedScore: number;
  /** Projected letter grade */
  projectedGrade: string;
  /** Confidence level based on data availability */
  confidence: 'low' | 'medium' | 'high';
  /** Number of months used for projection */
  basedOnMonths: number;
  /** Human-readable projection note */
  projectionNote: string;
  /** Month-by-month projections through end of year */
  monthlyProjections: MonthlyProjection[];
}

/**
 * Monthly Projection
 *
 * Projected score for a specific future month.
 */
export interface MonthlyProjection {
  /** Month label (e.g., "Nov 2025") */
  monthLabel: string;
  /** ISO date for the month */
  month: string;
  /** Projected score */
  projectedScore: number;
  /** Projected grade */
  projectedGrade: string;
}

/**
 * Measure Year-over-Year Comparison
 *
 * Year-over-year comparison for a single measure.
 */
export interface MeasureYoYComparison {
  /** Internal measure name */
  measureName: string;
  /** Display name */
  displayName: string;
  /** Previous year average value */
  previousYearAverage: number;
  /** Current year average value */
  currentYearAverage: number;
  /** Percentage change from previous year */
  changePercent: number;
  /** Whether improvement occurred (based on higher_is_better) */
  improved: boolean;
  /** Format type for display */
  formatType: 'number' | 'currency' | 'percentage';
}

/**
 * Annual Review Summary
 *
 * Summary statistics for annual performance.
 */
export interface AnnualReviewSummary {
  /** Average score across all months */
  averageScore: number;
  /** Highest monthly score */
  highestScore: number;
  /** Lowest monthly score */
  lowestScore: number;
  /** Number of months included in analysis */
  monthsAnalyzed: number;
  /** Overall trend direction */
  trend: 'improving' | 'declining' | 'stable';
  /** Percentage improvement from older to recent periods */
  improvementPercentage: number;
}

/**
 * Annual Review
 *
 * Complete annual review with year-over-year comparison and forecasts.
 */
export interface AnnualReview {
  /** Practice UID */
  practiceUid: number;
  /** Current year for context */
  currentYear: number;
  /** Monthly scores for the review period */
  monthlyScores: MonthlyScore[];
  /** Year-over-year comparison (null if insufficient data) */
  yearOverYear: YearOverYearComparison | null;
  /** Per-measure year-over-year comparisons */
  measureYoY: MeasureYoYComparison[];
  /** Summary statistics */
  summary: AnnualReviewSummary;
  /** Forecast (null if insufficient data) */
  forecast: AnnualForecast | null;
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
  size_bucket: 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge';
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
  size_bucket: 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge';
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
  bucketCounts: Record<'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge', number>;
  duration: number;
}
