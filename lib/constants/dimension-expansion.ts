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
 * Maximum number of charts to render in parallel during dimension expansion
 * Prevents server overload from too many concurrent queries
 */
export const MAX_PARALLEL_DIMENSION_CHARTS = 20;

