/**
 * Query Limits Constants
 *
 * Centralized constants for database query pagination and limiting.
 * Ensures consistency across all services and prevents hardcoded magic numbers.
 */

/**
 * Query limit constants for pagination and sampling
 */
export const QUERY_LIMITS = {
  /**
   * Default limit for data sources list queries
   */
  DATA_SOURCES_DEFAULT: 50,

  /**
   * Default limit for data source columns list queries
   */
  DATA_SOURCE_COLUMNS_DEFAULT: 100,

  /**
   * Sample size for connection testing (row count queries)
   */
  CONNECTION_TEST_SAMPLE_SIZE: 1000,

  /**
   * Maximum rows allowed in a single query (security limit)
   */
  MAX_ROWS_PER_QUERY: 10000,

  /**
   * Default limit for chart data queries
   */
  CHART_DATA_DEFAULT: 100,

  /**
   * Default limit for analytics queries
   */
  ANALYTICS_DEFAULT: 50,
} as const;

/**
 * Type-safe access to query limit keys
 */
export type QueryLimitKey = keyof typeof QUERY_LIMITS;
