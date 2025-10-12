/**
 * Analytics System Constants
 *
 * Centralized constants for the analytics and charting system.
 * Following best practices: no magic numbers, maintainable configuration.
 */

/**
 * HTTP Cache Control Constants
 * Used for client-side caching of analytics data
 */
export const CACHE_CONTROL = {
  /**
   * Max age for cached analytics data (5 minutes)
   * Balance between freshness and performance
   */
  MAX_AGE_SECONDS: 300,

  /**
   * Stale-while-revalidate window (1 minute)
   * Allows serving stale content while fetching fresh data
   */
  STALE_WHILE_REVALIDATE_SECONDS: 60,
} as const;

/**
 * Query Limit Constants
 * Maximum number of records to fetch/process
 */
export const QUERY_LIMITS = {
  /**
   * Default limit for analytics queries
   * Prevents excessive memory usage and slow queries
   */
  DEFAULT_ANALYTICS_LIMIT: 10000,

  /**
   * Maximum limit for list queries (charts, dashboards)
   * High value for backward compatibility, should be paginated
   */
  DEFAULT_LIST_LIMIT: 1000000,
} as const;

/**
 * Build Cache-Control header value
 *
 * @param maxAge - Max age in seconds (default: 5 minutes)
 * @param staleWhileRevalidate - Stale-while-revalidate in seconds (default: 1 minute)
 * @returns Cache-Control header value
 *
 * @example
 * ```typescript
 * response.headers.set('Cache-Control', buildCacheControlHeader());
 * // => 'private, max-age=300, stale-while-revalidate=60'
 * ```
 */
export function buildCacheControlHeader(
  maxAge: number = CACHE_CONTROL.MAX_AGE_SECONDS,
  staleWhileRevalidate: number = CACHE_CONTROL.STALE_WHILE_REVALIDATE_SECONDS
): string {
  return `private, max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`;
}
