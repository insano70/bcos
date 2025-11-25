/**
 * Dimension Expansion Constants
 *
 * Configuration constants for dimension expansion system
 */

/**
 * Maximum number of dimension values to return
 * Prevents performance issues from unbounded queries
 */
export const DIMENSION_EXPANSION_LIMITS = {
  DEFAULT: 20,
  MAXIMUM: 50,
} as const;

/**
 * Top N dimension values to show before grouping into "Other"
 * Prevents UI overload from dimensions with many values (e.g., Payer with 30+ values)
 * Shows top 10 by record count, remaining values grouped into "Other" category
 */
export const TOP_N_DIMENSION_VALUES = 10;

/**
 * Minimum value count required for a dimension to be expandable
 * Dimensions with only 0 or 1 value cannot be meaningfully expanded for comparison
 */
export const MIN_EXPANDABLE_VALUE_COUNT = 2;

/**
 * Maximum number of charts to render in parallel during dimension expansion
 * Prevents server overload from too many concurrent queries
 * Increased to 100 to support pagination (20 shown at a time on frontend)
 */
export const MAX_PARALLEL_DIMENSION_CHARTS = 100;

/**
 * Maximum number of concurrent database queries during dimension expansion
 * Controls p-limit concurrency to prevent connection pool exhaustion
 */
export const MAX_CONCURRENT_DIMENSION_QUERIES = 10;

/**
 * Maximum number of dimensions to expand by simultaneously
 * Prevents cartesian explosion (3 dimensions × 10 values each = 1000 charts)
 */
export const MAX_DIMENSIONS_PER_EXPANSION = 3;

/**
 * Number of charts to display per page in dimension comparison view
 * Frontend shows this many initially, with "Show More" to load additional batches
 */
export const CHARTS_PER_PAGE = 20;

/**
 * Warning thresholds for combination count in dimension selector
 */
export const COMBINATION_WARNING_THRESHOLD = 15; // Low warning (amber)
export const COMBINATION_HIGH_WARNING_THRESHOLD = 50; // High warning (amber, stronger message)

