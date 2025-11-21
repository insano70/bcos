/**
 * Chart Config Cache Service
 *
 * Manages in-memory caching of built chart configurations.
 * Provides bounded cache with LRU-style eviction to prevent memory leaks.
 *
 * Single Responsibility:
 * - Cache key generation
 * - Cache storage and retrieval
 * - Cache invalidation
 * - Cache eviction when size limits exceeded
 * - Cache statistics tracking
 */

import { createHash } from 'node:crypto';
import { log } from '@/lib/logger';
import type { ChartExecutionConfig, ResolvedFilters } from './types';

/**
 * Cache statistics for monitoring
 */
export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: string;
}

/**
 * Chart Config Cache Service
 *
 * Bounded in-memory cache with LRU-style eviction.
 * Thread-safe for single-threaded Node.js environment.
 */
export class ChartConfigCacheService {
  private cache = new Map<string, ChartExecutionConfig>();
  private readonly MAX_CACHE_SIZE = 1000;
  private stats = {
    hits: 0,
    misses: 0,
    size: 0,
  };

  /**
   * Build deterministic cache key from chart ID and filters
   *
   * Cache key format: config:{chartId}:{filterHash}
   * Filter hash is MD5 of sorted filter components (first 16 chars)
   *
   * @param chartId - Chart definition ID
   * @param filters - Resolved universal filters
   * @returns Cache key string
   */
  buildCacheKey(chartId: string, filters: ResolvedFilters): string {
    // Include only filter properties that affect config building
    const filterComponents = {
      startDate: filters.startDate,
      endDate: filters.endDate,
      dateRangePreset: filters.dateRangePreset,
      organizationId: filters.organizationId,
      practiceUids: filters.practiceUids?.sort(), // Sort for consistency
      providerName: filters.providerName,
    };

    const filterHash = createHash('md5')
      .update(JSON.stringify(filterComponents))
      .digest('hex')
      .substring(0, 16);

    return `config:${chartId}:${filterHash}`;
  }

  /**
   * Get config from cache
   *
   * Updates cache statistics on hit/miss.
   *
   * @param cacheKey - Cache key from buildCacheKey()
   * @returns Cached config or undefined if not found
   */
  get(cacheKey: string): ChartExecutionConfig | undefined {
    const cached = this.cache.get(cacheKey);

    if (cached) {
      this.stats.hits++;
      log.debug('Chart config cache hit', {
        cacheKey,
        cacheStats: this.getStats(),
        component: 'chart-config-cache',
      });
    } else {
      this.stats.misses++;
    }

    return cached;
  }

  /**
   * Store config in cache with automatic eviction
   *
   * If cache exceeds MAX_CACHE_SIZE, oldest 100 entries are evicted.
   * Uses Map iteration order (insertion order) for LRU-style eviction.
   *
   * @param cacheKey - Cache key from buildCacheKey()
   * @param config - Chart execution config to cache
   */
  set(cacheKey: string, config: ChartExecutionConfig): void {
    this.cache.set(cacheKey, config);
    this.stats.size = this.cache.size;

    // LRU eviction if cache exceeds limit
    if (this.cache.size > this.MAX_CACHE_SIZE) {
      this.evictOldest(100);
    }
  }

  /**
   * Evict oldest entries from cache
   *
   * Uses Map iteration order (insertion order).
   * Oldest entries are first in iteration.
   *
   * @param count - Number of entries to evict
   */
  private evictOldest(count: number): void {
    const keysToDelete = Array.from(this.cache.keys()).slice(0, count);

    for (const key of keysToDelete) {
      this.cache.delete(key);
    }

    this.stats.size = this.cache.size;

    log.warn('Config cache eviction triggered', {
      maxSize: this.MAX_CACHE_SIZE,
      evictedCount: keysToDelete.length,
      newSize: this.cache.size,
      component: 'chart-config-cache',
    });
  }

  /**
   * Invalidate cache entries
   *
   * If chartId provided, invalidates all cache entries for that chart.
   * If chartId not provided, clears entire cache and resets statistics.
   *
   * @param chartId - Optional chart ID to invalidate (or all if omitted)
   */
  invalidate(chartId?: string): void {
    if (chartId) {
      // Invalidate specific chart (all filter combinations)
      const keysToDelete = Array.from(this.cache.keys()).filter((key) =>
        key.startsWith(`config:${chartId}:`)
      );

      for (const key of keysToDelete) {
        this.cache.delete(key);
      }

      this.stats.size = this.cache.size;

      log.info('Chart config cache invalidated', {
        chartId,
        keysDeleted: keysToDelete.length,
        component: 'chart-config-cache',
      });
    } else {
      // Clear entire cache
      const previousSize = this.cache.size;
      this.cache.clear();
      this.stats = { hits: 0, misses: 0, size: 0 };

      log.info('Chart config cache cleared', {
        previousSize,
        component: 'chart-config-cache',
      });
    }
  }

  /**
   * Get cache statistics
   *
   * Returns current cache statistics with calculated hit rate.
   * Hit rate is percentage of cache hits out of total requests.
   *
   * @returns Cache statistics object
   */
  getStats(): CacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate =
      totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;

    return {
      ...this.stats,
      hitRate: `${hitRate.toFixed(1)}%`,
    };
  }
}
