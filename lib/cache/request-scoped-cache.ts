/**
 * Request-Scoped Cache for Data Source Queries
 *
 * Provides request-level deduplication of data source fetches.
 * When multiple charts in a dashboard request the same (measure + frequency),
 * only one actual Redis fetch occurs - subsequent requests use the in-memory cache.
 *
 * PERFORMANCE IMPACT:
 * - Before: Dashboard with 5 "Payments Monthly" charts = 5 Redis fetches (281K rows × 5)
 * - After: Same dashboard = 1 Redis fetch + 4 in-memory lookups
 *
 * LIFECYCLE:
 * - Created per dashboard render request
 * - Lives only for the duration of the request
 * - Garbage collected after response is sent
 *
 * THREAD SAFETY:
 * - Node.js is single-threaded, so no mutex needed
 * - Each request gets its own cache instance
 */

import { log } from '@/lib/logger';
import type { CacheQueryParams, DataSourceFetchResult } from './data-source-cache';

/**
 * Cache entry with metadata for debugging
 */
interface CacheEntry {
  result: DataSourceFetchResult;
  fetchedAt: number;
  rowCount: number;
}

/**
 * Build a cache key from query parameters
 * Only includes components that affect the Redis cache lookup
 */
function buildCacheKey(params: CacheQueryParams): string {
  const parts = [
    `ds:${params.dataSourceId}`,
    params.measure && `m:${params.measure}`,
    params.frequency && `f:${params.frequency}`,
    params.practiceUid && `p:${params.practiceUid}`,
    params.providerUid && `pr:${params.providerUid}`,
  ].filter(Boolean);

  return parts.join(':');
}

/**
 * Request-Scoped Cache
 *
 * Deduplicates data source fetches within a single request.
 * Pass this cache instance through the render pipeline.
 */
export class RequestScopedCache {
  private cache = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;
  private coalesced = 0; // Requests that joined a pending fetch (deduplication wins)
  private pendingFetches = new Map<string, Promise<DataSourceFetchResult>>();
  private readonly requestId: string;
  private readonly createdAt: number;

  constructor(requestId?: string) {
    this.requestId = requestId || `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    this.createdAt = Date.now();
  }

  /**
   * Get cached result if available
   *
   * @param params - Query parameters
   * @returns Cached result or undefined
   */
  get(params: CacheQueryParams): DataSourceFetchResult | undefined {
    const key = buildCacheKey(params);
    const entry = this.cache.get(key);

    if (entry) {
      this.hits++;
      log.debug('Request-scoped cache hit', {
        requestId: this.requestId,
        cacheKey: key,
        rowCount: entry.rowCount,
        age: Date.now() - entry.fetchedAt,
        component: 'request-scoped-cache',
      });
      return entry.result;
    }

    return undefined;
  }

  /**
   * Store result in cache
   *
   * @param params - Query parameters
   * @param result - Fetch result to cache
   */
  set(params: CacheQueryParams, result: DataSourceFetchResult): void {
    const key = buildCacheKey(params);
    this.misses++;

    this.cache.set(key, {
      result,
      fetchedAt: Date.now(),
      rowCount: result.rows.length,
    });

    log.debug('Request-scoped cache set', {
      requestId: this.requestId,
      cacheKey: key,
      rowCount: result.rows.length,
      component: 'request-scoped-cache',
    });
  }

  /**
   * Get or fetch with deduplication
   *
   * If multiple concurrent calls request the same key, only one fetch occurs.
   * Other calls wait for the first fetch to complete and share the result.
   *
   * @param params - Query parameters
   * @param fetchFn - Function to call on cache miss
   * @returns Fetch result (from cache or fresh fetch)
   */
  async getOrFetch(
    params: CacheQueryParams,
    fetchFn: () => Promise<DataSourceFetchResult>
  ): Promise<DataSourceFetchResult> {
    // Check cache first
    const cached = this.get(params);
    if (cached) {
      return cached;
    }

    const key = buildCacheKey(params);

    // Check if there's already a pending fetch for this key
    const pending = this.pendingFetches.get(key);
    if (pending) {
      this.coalesced++; // Track deduplication wins
      log.debug('Request-scoped cache: joining pending fetch (deduplication)', {
        requestId: this.requestId,
        cacheKey: key,
        coalescedCount: this.coalesced,
        component: 'request-scoped-cache',
      });
      return pending;
    }

    // Start new fetch and track it
    const fetchPromise = fetchFn().then((result) => {
      this.set(params, result);
      this.pendingFetches.delete(key);
      return result;
    }).catch((error) => {
      this.pendingFetches.delete(key);
      throw error;
    });

    this.pendingFetches.set(key, fetchPromise);
    return fetchPromise;
  }

  /**
   * Get cache statistics
   *
   * Stats explanation:
   * - misses: Unique data sources fetched (one Redis call each)
   * - hits: Requests served from already-cached data (sequential reuse)
   * - coalesced: Requests that joined a pending fetch (parallel deduplication)
   * - dedupRate: (hits + coalesced) / total - overall cache effectiveness
   */
  getStats(): {
    hits: number;
    misses: number;
    coalesced: number;
    hitRate: number;
    dedupRate: number;
    entriesCount: number;
    totalRows: number;
    requestId: string;
    ageMs: number;
  } {
    const totalRows = Array.from(this.cache.values()).reduce(
      (sum, entry) => sum + entry.rowCount,
      0
    );

    const total = this.hits + this.misses + this.coalesced;
    const hitRate = total > 0 ? this.hits / total : 0;
    const dedupRate = total > 0 ? (this.hits + this.coalesced) / total : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      coalesced: this.coalesced,
      hitRate,
      dedupRate,
      entriesCount: this.cache.size,
      totalRows,
      requestId: this.requestId,
      ageMs: Date.now() - this.createdAt,
    };
  }

  /**
   * Log final statistics (call at end of request)
   */
  logFinalStats(): void {
    const stats = this.getStats();

    // Log if any deduplication occurred (hits or coalesced)
    if (stats.hits > 0 || stats.coalesced > 0) {
      log.info('Request-scoped cache statistics', {
        ...stats,
        hitRatePercent: `${(stats.hitRate * 100).toFixed(1)}%`,
        dedupRatePercent: `${(stats.dedupRate * 100).toFixed(1)}%`,
        savedFetches: stats.hits + stats.coalesced,
        component: 'request-scoped-cache',
      });
    }
  }

  /**
   * Clear the cache (optional cleanup)
   */
  clear(): void {
    this.cache.clear();
    this.pendingFetches.clear();
  }
}

/**
 * Create a new request-scoped cache for a dashboard render
 *
 * @param correlationId - Optional correlation ID from request context
 * @returns New RequestScopedCache instance
 */
export function createRequestScopedCache(correlationId?: string): RequestScopedCache {
  return new RequestScopedCache(correlationId);
}

