/**
 * Report Card Constants
 *
 * Centralized constants for report card statistics, trends, and sizing.
 * Ensures consistency across all services and prevents hardcoded magic numbers.
 */

/**
 * Report card processing limits
 */
export const REPORT_CARD_LIMITS = {
  /**
   * Maximum number of measures that can be active at once
   */
  MAX_MEASURES: 20,

  /**
   * Maximum practices to process in a single batch
   */
  MAX_PRACTICES_PER_BATCH: 100,

  /**
   * Hours before statistics are considered stale
   */
  STALE_THRESHOLD_HOURS: 24,

  /**
   * Minimum months of data required for trend calculation
   */
  MIN_MONTHS_FOR_TREND: 3,
} as const;

/**
 * Trend period definitions
 */
export const TREND_PERIODS = ['3_month', '6_month', '9_month'] as const;
export type TrendPeriod = (typeof TREND_PERIODS)[number];

/**
 * Size bucket definitions
 * Ordered from smallest to largest
 */
export const SIZE_BUCKETS = ['small', 'medium', 'large', 'xlarge', 'xxlarge'] as const;
export type SizeBucket = (typeof SIZE_BUCKETS)[number];

/**
 * Trend direction definitions
 */
export const TREND_DIRECTIONS = ['improving', 'declining', 'stable'] as const;
export type TrendDirection = (typeof TREND_DIRECTIONS)[number];

/**
 * Default percentile thresholds for size bucket assignment
 * Practices at or below these percentiles are assigned to each bucket
 * @deprecated Use CHARGE_BASED_THRESHOLDS instead for more accurate sizing
 */
export const DEFAULT_PERCENTILE_THRESHOLDS = {
  small: 25,
  medium: 50,
  large: 75,
  // xlarge is anything above 75th percentile
} as const;

/**
 * Charge-based thresholds for size bucket assignment
 * Based on actual charge distribution analysis (last 12 months):
 * - Uses recent performance to accurately reflect current practice size
 * - Thresholds set to create meaningful peer comparison groups
 *
 * NOTE: These are DEFAULT thresholds. The actual thresholds used may be
 * adjusted dynamically by the sizing algorithm to ensure each bucket
 * has at least MIN_BUCKET_SIZE members for meaningful peer comparison.
 *
 * Distribution (approximate with defaults):
 * - XXLarge (> $90M): ~10% of practices - industry giants
 * - XLarge ($46M - $90M): ~14% of practices - large practices
 * - Large ($25M - $46M): ~20% of practices
 * - Medium ($10M - $25M): ~22% of practices
 * - Small (< $10M): ~23% of practices
 */
export const CHARGE_BASED_THRESHOLDS = {
  /** Annual charges threshold for Small → Medium */
  small_max: 10_000_000, // $10M
  /** Annual charges threshold for Medium → Large */
  medium_max: 25_000_000, // $25M
  /** Annual charges threshold for Large → XLarge */
  large_max: 46_000_000, // $46M
  /** Annual charges threshold for XLarge → XXLarge */
  xlarge_max: 90_000_000, // $90M
  /** Minimum annual charges to be included in sizing (exclude inactive practices) */
  minimum_charges: 100_000, // $100K
} as const;

/**
 * Bucket sizing constraints
 * Controls adaptive threshold adjustment to ensure meaningful peer comparison
 */
export const BUCKET_SIZING = {
  /**
   * Minimum practices required per bucket for meaningful peer comparison.
   * If a bucket has fewer than this many practices, thresholds will be
   * adjusted to pull in more practices from adjacent buckets.
   */
  MIN_BUCKET_SIZE: 5,
} as const;

/**
 * Trend calculation thresholds
 * Percentage change thresholds for determining trend direction
 */
export const TREND_THRESHOLDS = {
  /**
   * Minimum positive change to be considered "improving"
   */
  IMPROVING_MIN_PERCENT: 5,

  /**
   * Minimum negative change to be considered "declining"
   */
  DECLINING_MIN_PERCENT: -5,
} as const;

/**
 * Format types for measure display
 */
export const FORMAT_TYPES = ['number', 'currency', 'percentage'] as const;
export type FormatType = (typeof FORMAT_TYPES)[number];

/**
 * Letter grade thresholds for overall scores (70-100 scale)
 * 
 * GRADING PHILOSOPHY:
 * - Percentile ranks (0-100) are transformed to grade scale (70-100)
 * - This ensures no practice gets D or F, floor is C- (70)
 * - Encourages improvement rather than demoralizing practices
 * 
 * TRANSFORMATION (applied in normalizeScore):
 * - 0th percentile → 70 (C-)
 * - 33rd percentile → 80 (B-)
 * - 67th percentile → 90 (A-)
 * - 100th percentile → 100 (A+)
 * 
 * EXPECTED GRADE DISTRIBUTION:
 * - Bottom third: C range (70-79)
 * - Middle third: B range (80-89)
 * - Top third: A range (90-100)
 * 
 * Score to Grade mapping:
 * - 90-100: A range (A-, A, A+)
 * - 80-89: B range (B-, B, B+)  
 * - 70-79: C range (C-, C, C+)
 */
export const GRADE_THRESHOLDS = {
  A: 90,
  B: 80,
  C: 70,
  /** Minimum score - scores are transformed to never go below this */
  FLOOR: 70,
} as const;

/**
 * Score transformation constants
 * 
 * Used to transform raw percentile (0-100) to grading scale (70-100):
 * - Formula: FLOOR + (percentile / 100) * RANGE
 * - 0th percentile → 70 (C-)
 * - 50th percentile → 85 (B-)
 * - 100th percentile → 100 (A+)
 */
export const SCORE_TRANSFORMATION = {
  /** Minimum score (C-) */
  FLOOR: 70,
  /** Score range above floor */
  RANGE: 30,
  /** Trend bonus/penalty for improving/declining */
  TREND_ADJUSTMENT: 3,
} as const;

/**
 * Apply the grade floor to a raw score
 * Note: With the new scoring transformation, scores should already be 70+
 * This is a safety net for edge cases
 */
export function applyGradeFloor(rawScore: number): number {
  return Math.max(GRADE_THRESHOLDS.FLOOR, rawScore);
}

/**
 * Measure name used for practice sizing calculations
 * Must match the measure_name in analytics database (case-insensitive matching recommended)
 */
export const SIZING_MEASURE = 'Charges' as const;

/**
 * Type-safe access to report card limit keys
 */
export type ReportCardLimitKey = keyof typeof REPORT_CARD_LIMITS;
