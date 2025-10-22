/**
 * Cache Operations for Data Source Cache
 *
 * Handles direct Redis interactions for data source caching.
 *
 * RESPONSIBILITIES:
 * - Get cached data (via indexed cache or direct Redis)
 * - Invalidate cache entries (pattern-based deletion)
 * - Cache existence checks
 *
 * ARCHITECTURE:
 * - Delegates to IndexedAnalyticsCache for efficient queries
 * - Cache warming (via warming-service.ts) handles ALL cache population
 * - Query-time caching removed to prevent dual cache system conflicts
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
  private readonly MAX_CACHE_SIZE = 1024 * 1024 * 1024; // 1GB (support for large table-based datasets)
  private readonly MAX_ROWS = 1000000; // 1M rows max (prevents memory exhaustion)
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

    log.info('Cache lookup initiated', {
      datasourceId,
      isWarm,
      dataSourceType: components.dataSourceType,
      measure: components.measure,
      frequency: components.frequency,
      practiceUid: components.practiceUid,
      providerUid: components.providerUid,
      component: 'cache-operations',
    });

    // Check cache age (if warm) to detect stale cache
    let shouldWarm = !isWarm;
    let cacheAgeHours: number | null = null;
    let staleness: CacheStaleness = 'cold';

    if (isWarm) {
      // Get last warmed timestamp to check age (lightweight - single Redis GET)
      const lastWarmed = await indexedAnalyticsCache.getLastWarmedTime(datasourceId);

      if (lastWarmed) {
        const lastWarmTime = new Date(lastWarmed).getTime();
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

    // For measure-based sources, use indexed cache with measure + frequency
    const willUseIndexedCache = isWarm && components.dataSourceType !== 'table-based' && components.measure && components.frequency;

    log.info('Cache lookup decision', {
      datasourceId,
      willUseIndexedCache,
      reason: !willUseIndexedCache ?
        (!isWarm ? 'cache_not_warm' :
         components.dataSourceType === 'table-based' ? 'table_based_type' :
         !components.measure ? 'no_measure' :
         !components.frequency ? 'no_frequency' : 'unknown') :
        'attempting_indexed_cache',
      component: 'cache-operations',
    });

    if (willUseIndexedCache && components.measure && components.frequency) {
      // Try indexed cache with index lookup
      // Type guard confirms measure and frequency are defined
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
          log.info('Data source cache hit (measure-based)', {
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

    // For table-based sources, try direct Redis lookup
    if (components.dataSourceType === 'table-based') {
      const client = getRedisClient();
      if (client) {
        const key = cacheKeyBuilder.buildKey(components);
        try {
          const cached = await client.get(key);
          if (cached) {
            const parsed = JSON.parse(cached) as CachedDataEntry;
            log.info('Data source cache hit (table-based)', {
              cacheKey: key,
              cacheLevel: 0,
              rowCount: parsed.rowCount,
              cacheAgeHours: cacheAgeHours ? Math.round(cacheAgeHours * 10) / 10 : null,
              staleness,
            });

            return {
              rows: parsed.rows,
              cacheKey: key,
              cacheLevel: 0,
            };
          }
        } catch (error) {
          log.warn('Table-based cache query failed, will try database', { error, key });
        }
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
   * Set data in cache (TABLE-BASED ONLY)
   *
   * IMPORTANT: This method should ONLY be used for table-based data sources.
   * Measure-based sources MUST use indexed analytics cache (via warming).
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
    // CRITICAL: Only allow table-based caching to prevent dual cache system conflicts
    if (components.dataSourceType !== 'table-based') {
      log.warn('Attempted to cache non-table-based data via setCached - use warming instead', {
        dataSourceId: components.dataSourceId,
        dataSourceType: components.dataSourceType,
        measure: components.measure,
        operation: 'setCached',
      });
      return;
    }

    const key = cacheKeyBuilder.buildKey(components);
    const now = new Date();
    const effectiveTTL = ttl || this.TTL;
    const expiresAt = new Date(now.getTime() + effectiveTTL * 1000);

    // SECURITY/PERFORMANCE: Check row count BEFORE stringifying to prevent OOM
    if (rows.length > this.MAX_ROWS) {
      log.warn('Data source cache entry has too many rows - rejecting', {
        key,
        rowCount: rows.length,
        maxRows: this.MAX_ROWS,
        dataSourceType: components.dataSourceType,
      });
      return;
    }

    // SECURITY/PERFORMANCE: Estimate size before stringifying
    const estimatedBytes = rows.length * 1000;
    if (estimatedBytes > this.MAX_CACHE_SIZE) {
      log.warn('Data source cache entry estimated too large - rejecting', {
        key,
        estimatedGB: Math.round((estimatedBytes / (1024 * 1024 * 1024)) * 100) / 100,
        maxGB: Math.round((this.MAX_CACHE_SIZE / (1024 * 1024 * 1024)) * 100) / 100,
        rowCount: rows.length,
        dataSourceType: components.dataSourceType,
      });
      return;
    }

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

    // Final size check after stringification
    if (cachedData.sizeBytes > this.MAX_CACHE_SIZE) {
      const sizeGB = cachedData.sizeBytes / (1024 * 1024 * 1024);
      const maxGB = this.MAX_CACHE_SIZE / (1024 * 1024 * 1024);

      log.warn('Data source cache entry too large after stringification', {
        key,
        sizeGB: Math.round(sizeGB * 100) / 100,
        maxGB: Math.round(maxGB * 100) / 100,
        rowCount: rows.length,
        dataSourceType: components.dataSourceType,
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

      // Log in GB if > 100MB, otherwise use KB
      const sizeMB = cachedData.sizeBytes / (1024 * 1024);
      const logData =
        sizeMB > 100
          ? {
              key,
              rowCount: rows.length,
              sizeGB: Math.round((sizeMB / 1024) * 100) / 100,
              ttl: effectiveTTL,
              expiresAt: expiresAt.toISOString(),
            }
          : {
              key,
              rowCount: rows.length,
              sizeKB: Math.round(cachedData.sizeBytes / 1024),
              ttl: effectiveTTL,
              expiresAt: expiresAt.toISOString(),
            };

      log.info('Table-based data source cached', logData);
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
   * @param measure - Optional measure filter (measure-based only)
   * @param dataSourceType - Optional type filter
   */
  async invalidate(
    dataSourceId?: number,
    measure?: string,
    dataSourceType?: 'measure-based' | 'table-based'
  ): Promise<void> {
    const client = getRedisClient();
    if (!client) {
      log.debug('Redis not available, skipping cache invalidation');
      return;
    }

    const pattern = cacheKeyBuilder.buildPattern(dataSourceId, measure, dataSourceType);

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
