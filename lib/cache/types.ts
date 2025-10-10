/**
 * Cache Types and Interfaces
 *
 * Shared types used across all cache services.
 */

/**
 * Cache operation options
 */
export interface CacheOptions {
  /** Time-to-live in seconds */
  ttl?: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  errors: number;
  hitRate: number;
}

/**
 * Cache key type (for type safety)
 */
export type CacheKey = string;

/**
 * Cache invalidation options
 */
export interface InvalidateOptions {
  /** Pattern to match keys (e.g., "user:*") */
  pattern?: string;
  /** Specific keys to invalidate */
  keys?: string[];
}
