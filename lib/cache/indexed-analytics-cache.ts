/**
 * Indexed Analytics Cache with Secondary Index Sets
 *
 * REFACTORED: This file now delegates to specialized services in lib/cache/indexed-analytics/
 * Maintains 100% API compatibility while improving maintainability through single responsibility.
 *
 * For implementation details, see:
 * - lib/cache/indexed-analytics/index.ts (orchestrator)
 * - lib/cache/indexed-analytics/query-service.ts (queries)
 * - lib/cache/indexed-analytics/warming-service.ts (cache warming)
 * - lib/cache/indexed-analytics/invalidation-service.ts (cleanup)
 */

// Re-export everything from the new modular implementation
export {
  IndexedAnalyticsCache,
  indexedAnalyticsCache,
  type CacheEntry,
  type CacheQueryFilters,
  type CacheStats,
  type WarmResult,
  type ProgressCallback,
} from './indexed-analytics/index';
