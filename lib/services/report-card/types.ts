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
 * SECURITY: Collection should only be invoked from CLI or admin API
 */
export interface CollectionOptions {
  practiceUid?: number | undefined;
  force?: boolean | undefined;
  /**
   * SECURITY: Set to true when called from admin API endpoint
   * If not set, will check for BCOS_CLI_MODE environment variable
   */
  fromAdminApi?: boolean | undefined;
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
  trendPeriod: import('@/lib/constants/report-card').TrendPeriod;
  direction: import('@/lib/constants/report-card').TrendDirection;
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

// ============================================================================
// Preloaded Data Types for Bulk Operations
// ============================================================================

/**
 * Preloaded size bucket data for all practices
 * Key: practice_uid
 */
export type SizeBucketMap = Map<number, {
  size_bucket: string;
  percentile: number;
  organization_id: string | null;
}>;

/**
 * Preloaded organization mappings
 * Key: practice_uid, Value: organization_id
 */
export type OrganizationMap = Map<number, string | null>;

/**
 * Preloaded statistics for a month
 * Key: `${practice_uid}:${measure_name}`, Value: numeric value
 */
export type MonthStatisticsMap = Map<string, number>;

/**
 * Preloaded peer statistics for comparison
 * Key: `${size_bucket}:${measure_name}`
 */
export type PeerStatisticsMap = Map<string, {
  values: number[];
  average: number;
  peerCount: number;
  practiceValues: Map<number, number>; // practice_uid -> value
}>;

/**
 * Preloaded trend data for practices
 * Key: `${practice_uid}:${measure_name}`, Value: array of {date, value}
 */
export type TrendDataMap = Map<string, Array<{ date: Date; value: number }>>;

/**
 * Preloaded data bundle passed to generation methods
 */
export interface PreloadedData {
  sizeBuckets: SizeBucketMap;
  organizations: OrganizationMap;
  monthStatistics: MonthStatisticsMap;
  peerStatistics: PeerStatisticsMap;
  trendData: TrendDataMap;
  measures: import('@/lib/types/report-card').MeasureConfig[];
}

// ============================================================================
// Dependency Injection Interfaces for Testability
// ============================================================================

/**
 * Score calculator interface for dependency injection
 */
export interface IScoreCalculator {
  calculatePercentile(value: number, allValues: number[], higherIsBetter: boolean): number;
  calculateTrendScore(trendPercentage: number): number;
  normalizeScore(
    percentileRank: number,
    trend: import('@/lib/constants/report-card').TrendDirection,
    higherIsBetter: boolean,
    trendPercentage?: number
  ): number;
  calculateOverallScore(
    results: MeasureScoringResult[],
    measures: import('@/lib/types/report-card').MeasureConfig[]
  ): number;
  scoreMeasure(
    practiceUid: number,
    measure: import('@/lib/types/report-card').MeasureConfig,
    sizeBucket: import('@/lib/constants/report-card').SizeBucket,
    targetMonth: string,
    monthStats: MonthStatisticsMap,
    peerStats: PeerStatisticsMap,
    trendDataMap: TrendDataMap
  ): MeasureScoringResult | null;
  calculateTrend(
    practiceUid: number,
    measure: import('@/lib/types/report-card').MeasureConfig,
    targetMonth: string,
    trendDataMap: TrendDataMap
  ): { direction: import('@/lib/constants/report-card').TrendDirection; percentage: number };
  generateInsights(
    results: MeasureScoringResult[],
    measures: import('@/lib/types/report-card').MeasureConfig[]
  ): string[];
}

/**
 * Data preloader interface for dependency injection
 */
export interface IDataPreloader {
  preloadSizeBuckets(practices: number[]): Promise<SizeBucketMap>;
  preloadMonthStatistics(
    practices: number[],
    measures: import('@/lib/types/report-card').MeasureConfig[],
    targetMonth: string
  ): Promise<MonthStatisticsMap>;
  preloadPeerStatistics(
    measures: import('@/lib/types/report-card').MeasureConfig[],
    targetMonth: string
  ): Promise<PeerStatisticsMap>;
  preloadTrendData(
    practices: number[],
    measures: import('@/lib/types/report-card').MeasureConfig[],
    targetMonth: string
  ): Promise<TrendDataMap>;
}

/**
 * Measure service interface for dependency injection
 * NOTE: getActiveMeasures is a standalone function, not part of this interface
 */
export interface IMeasureService {
  getList(options?: { activeOnly?: boolean }): Promise<{
    items: import('@/lib/types/report-card').MeasureConfig[];
    total: number;
  }>;
  getById(id: number): Promise<import('@/lib/types/report-card').MeasureConfig | null>;
  create(
    data: import('@/lib/types/report-card').MeasureCreateInput
  ): Promise<import('@/lib/types/report-card').MeasureConfig>;
  update(
    id: number,
    data: import('@/lib/types/report-card').MeasureUpdateInput
  ): Promise<import('@/lib/types/report-card').MeasureConfig>;
  delete(id: number): Promise<void>;
}
