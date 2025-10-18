/**
 * Cache Operations for Data Source Cache
 *
 * Handles direct Redis interactions for data source caching.
 *
 * RESPONSIBILITIES:
 * - Get cached data (via indexed cache or direct Redis)
 * - Set cached data (with size validation)
 * - Invalidate cache entries (pattern-based deletion)
 * - Cache existence checks
 *
 * ARCHITECTURE:
 * - Delegates to IndexedAnalyticsCache for efficient queries
 * - Falls back to direct Redis for backward compatibility
 * - Graceful degradation when Redis unavailable
 */

import { log } from '@/lib/logger';
import { getRedisClient } from '@/lib/redis';
import { indexedAnalyticsCache } from '../indexed-analytics-cache';
import type { CacheQueryFilters } from '../indexed-analytics-cache';
import type { CacheKeyComponents } from './cache-key-builder';
import { cacheKeyBuilder } from './cache-key-builder';

/**
 * Cached data entry structure
 */
interface CachedDataEntry {
  rows: Record<string, unknown>[];
  rowCount: number;
  cachedAt: string;
  expiresAt: string;
  sizeBytes: number;
  keyComponents: CacheKeyComponents;
}

/**
 * Cache staleness state
 */
export type CacheStaleness = 'cold' | 'stale' | 'fresh';

/**
 * Cache get result
 */
export interface CacheGetResult {
  rows: Record<string, unknown>[];
  cacheKey: string;
  cacheLevel: number;
}

/**
 * Cache Operations Service
 * Handles Redis get/set/invalidate operations
 */
export class CacheOperations {
  private readonly TTL = 172800; // 48 hours (2 days)
  private readonly MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB
  private readonly MAX_SCAN_ITERATIONS = 10000; // Safety limit to prevent infinite loops
  private readonly STALE_THRESHOLD_HOURS = 4; // Cache considered stale after 4 hours

  /**
   * Get cached data (with secondary index sets)
   * Tries indexed cache first with O(1) index lookup
   *
   * Caches data at granular level (measure + practice + provider + frequency)
   * and uses secondary indexes for efficient selective fetching
   *
   * @param components - Cache key components
   * @returns Cached data or null if not found
   */
  async getCached(components: CacheKeyComponents): Promise<CacheGetResult | null> {
    const datasourceId = components.dataSourceId;

    // Check if indexed cache is warm for this datasource
    const isWarm = await indexedAnalyticsCache.isCacheWarm(datasourceId);

    // Check cache age (if warm) to detect stale cache
    let shouldWarm = !isWarm;
    let cacheAgeHours: number | null = null;
    let staleness: CacheStaleness = 'cold';

    if (isWarm) {
      // Get cache stats to check age
      const stats = await indexedAnalyticsCache.getCacheStats(datasourceId);

      if (stats?.lastWarmed) {
        const lastWarmTime = new Date(stats.lastWarmed).getTime();
        const ageMs = Date.now() - lastWarmTime;
        cacheAgeHours = ageMs / (1000 * 60 * 60);

        // Trigger warming if cache is older than threshold (stale)
        if (cacheAgeHours > this.STALE_THRESHOLD_HOURS) {
          shouldWarm = true;
          staleness = 'stale';
        } else {
          staleness = 'fresh';
        }
      }
    }

    if (isWarm && components.measure && components.frequency) {
      // Try indexed cache with index lookup
      const filters: CacheQueryFilters = {
        datasourceId: datasourceId,
        measure: components.measure,
        frequency: components.frequency,
        ...(components.practiceUid && { practiceUids: [components.practiceUid] }),
        ...(components.providerUid && { providerUids: [components.providerUid] }),
      };

      try {
        const rows = await indexedAnalyticsCache.query(filters);

        if (rows.length > 0) {
          log.info('Data source cache hit', {
            cacheKey: `ds:${datasourceId}:m:${components.measure}:freq:${components.frequency}`,
            cacheLevel: 0,
            rowCount: rows.length,
            cacheAgeHours: cacheAgeHours ? Math.round(cacheAgeHours * 10) / 10 : null,
            staleness,
            warmingNeeded: shouldWarm,
          });

          return {
            rows,
            cacheKey: `ds:${datasourceId}:m:${components.measure}`,
            cacheLevel: 0,
          };
        }
      } catch (error) {
        log.warn('Cache query failed, will try database', { error, components });
      }
    }

    log.info('Data source cache miss', {
      dataSourceId: datasourceId,
      measure: components.measure,
      isWarm,
      cacheAgeHours: cacheAgeHours ? Math.round(cacheAgeHours * 10) / 10 : null,
      staleness,
      warmingNeeded: shouldWarm,
    });

    return null;
  }

  /**
   * Set data in cache
   *
   * @param components - Cache key components
   * @param rows - Data rows to cache
   * @param ttl - Time to live in seconds (optional, defaults to 48 hours)
   */
  async setCached(
    components: CacheKeyComponents,
    rows: Record<string, unknown>[],
    ttl?: number
  ): Promise<void> {
    const key = cacheKeyBuilder.buildKey(components);
    const now = new Date();
    const effectiveTTL = ttl || this.TTL;
    const expiresAt = new Date(now.getTime() + effectiveTTL * 1000);

    const cachedData: CachedDataEntry = {
      rows,
      rowCount: rows.length,
      cachedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      sizeBytes: 0,
      keyComponents: components,
    };

    const jsonString = JSON.stringify(cachedData);
    cachedData.sizeBytes = Buffer.byteLength(jsonString, 'utf8');

    // Check size limit
    if (cachedData.sizeBytes > this.MAX_CACHE_SIZE) {
      log.warn('Data source cache entry too large', {
        key,
        sizeMB: Math.round(cachedData.sizeBytes / 1024 / 1024),
        maxMB: Math.round(this.MAX_CACHE_SIZE / 1024 / 1024),
        rowCount: rows.length,
      });
      return;
    }

    const client = getRedisClient();
    if (!client) {
      log.debug('Redis not available, skipping cache set', { key });
      return;
    }

    try {
      await client.setex(key, effectiveTTL, jsonString);

      log.info('Data source cached', {
        key,
        rowCount: rows.length,
        sizeKB: Math.round(cachedData.sizeBytes / 1024),
        ttl: effectiveTTL,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      log.error('Failed to cache data', error instanceof Error ? error : new Error(String(error)), {
        key,
        operation: 'setCached',
      });
    }
  }

  /**
   * Invalidate cache entries
   *
   * @param dataSourceId - Optional data source ID (if not provided, clears all)
   * @param measure - Optional measure filter
   */
  async invalidate(dataSourceId?: number, measure?: string): Promise<void> {
    const client = getRedisClient();
    if (!client) {
      log.debug('Redis not available, skipping cache invalidation');
      return;
    }

    const pattern = cacheKeyBuilder.buildPattern(dataSourceId, measure);

    try {
      // Get all matching keys
      const keys: string[] = [];
      let cursor = '0';
      let iterations = 0;

      do {
        if (iterations++ >= this.MAX_SCAN_ITERATIONS) {
          log.error('SCAN operation exceeded max iterations - Redis may be unhealthy', {
            pattern,
            iterations,
            keysFound: keys.length,
            operation: 'invalidate',
          });
          break;
        }

        const [newCursor, foundKeys] = await client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          1000
        );
        cursor = newCursor;
        keys.push(...foundKeys);
      } while (cursor !== '0');

      // Delete keys in batches
      if (keys.length > 0) {
        const batchSize = 1000;
        for (let i = 0; i < keys.length; i += batchSize) {
          const batch = keys.slice(i, i + batchSize);
          await client.del(...batch);
        }
      }

      if (!dataSourceId) {
        log.info('All data source caches cleared', { keysDeleted: keys.length });
      } else if (measure) {
        log.info('Cache invalidated for data source + measure', {
          dataSourceId,
          measure,
          keysDeleted: keys.length,
        });
      } else {
        log.info('Cache invalidated for data source', {
          dataSourceId,
          keysDeleted: keys.length,
        });
      }
    } catch (error) {
      log.error(
        'Failed to invalidate cache',
        error instanceof Error ? error : new Error(String(error)),
        {
          pattern,
          operation: 'invalidate',
        }
      );
    }
  }
}

// Export singleton instance
export const cacheOperations = new CacheOperations();
