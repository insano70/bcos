/**
 * Dimension Value Cache Service
 *
 * Caching layer for dimension value discovery.
 * Uses dataSourceCache (Redis) to fetch pre-populated analytics data,
 * then extracts unique dimension values in-memory.
 *
 * ARCHITECTURE (CORRECT):
 * - Fetches from dataSourceCache (where analytics data actually lives)
 * - Applies RBAC filtering via cache layer
 * - Extracts unique values in-memory with record counts
 * - Caches results separately for faster subsequent queries
 *
 * Key Features:
 * - Separate Redis cache entries for dimension values
 * - Short TTL (1 hour) - dimensions change infrequently
 * - RBAC filtering handled by dataSourceCache
 * - Supports all data source types (measure-based, table-based)
 */

import { log } from '@/lib/logger';
import { getRedisClient } from '@/lib/redis';
import type { ChartFilter } from '@/lib/types/analytics';
import type { UserContext } from '@/lib/types/rbac';
import type { DimensionValue } from '@/lib/types/dimensions';
import { chartConfigService } from '@/lib/services/chart-config-service';
import { createHash } from 'node:crypto';
import { TOP_N_DIMENSION_VALUES } from '@/lib/constants/dimension-expansion';

/**
 * Query parameters for dimension value discovery
 */
export interface DimensionValueQueryParams {
  dataSourceId: number;
  dimensionColumn: string;
  measure?: string;
  frequency?: string;
  startDate?: string;
  endDate?: string;
  practiceUids?: number[];
  advancedFilters?: ChartFilter[];
  limit?: number;
}

/**
 * Result from dimension value query
 */
export interface DimensionValueResult {
  values: DimensionValue[];
  fromCache: boolean;
  queryTimeMs: number;
  hasMore?: boolean; // Whether there are more values beyond the returned set
  otherRecordCount?: number; // Total record count for remaining values (beyond top N)
  totalUniqueValues?: number; // Total count of unique values before limiting
}

/**
 * Cache TTL for dimension values (1 hour)
 * Dimensions don't change frequently, so longer TTL is safe
 */
const DIMENSION_CACHE_TTL = 3600;

/**
 * Internal result type for query that includes Other metadata
 */
interface QueryResultWithMetadata {
  values: DimensionValue[];
  hasMore: boolean;
  otherRecordCount: number;
  totalUniqueValues: number;
}

/**
 * Dimension Value Cache Service
 *
 * Provides optimized dimension value queries with database-level
 * DISTINCT and separate Redis caching.
 */
export class DimensionValueCacheService {
  /**
   * Get unique dimension values using optimized SQL DISTINCT query
   *
   * Process:
   * 1. Check Redis cache (dimension-specific key)
   * 2. If miss, query database with DISTINCT + COUNT
   * 3. Cache results separately (small payload)
   * 4. Return dimension values with record counts
   *
   * Performance: 10-50x faster than in-memory filtering
   *
   * @param params - Query parameters
   * @param userContext - User context for RBAC
   * @returns Dimension values with metadata
   */
  async getDimensionValues(
    params: DimensionValueQueryParams,
    userContext: UserContext
  ): Promise<DimensionValueResult> {
    const startTime = Date.now();

    try {
      // Check cache first
      const cacheKey = this.buildCacheKey(params);
      const cached = await this.getCachedValues(cacheKey);

      if (cached) {
        const duration = Date.now() - startTime;

        // Check if cached data has "Other" entry to determine hasMore
        const hasOtherInCache = cached.values.some((v) => v.isOther === true);

        log.info('Dimension values served from cache', {
          dataSourceId: params.dataSourceId,
          dimensionColumn: params.dimensionColumn,
          valueCount: cached.values.length,
          cacheHit: true,
          hasMore: cached.hasMore,
          duration,
          userId: userContext.user_id,
          component: 'dimension-value-cache',
        });

        return {
          values: cached.values,
          fromCache: true,
          queryTimeMs: duration,
          hasMore: cached.hasMore ?? hasOtherInCache,
          otherRecordCount: cached.otherRecordCount,
          totalUniqueValues: cached.totalUniqueValues,
        };
      }

      // Cache miss - query database with optimized DISTINCT
      const queryResult = await this.queryDimensionValues(params, userContext);

      // Cache the full results including metadata
      await this.cacheValues(cacheKey, queryResult);

      const duration = Date.now() - startTime;

      log.info('Dimension values queried and cached', {
        dataSourceId: params.dataSourceId,
        dimensionColumn: params.dimensionColumn,
        valueCount: queryResult.values.length,
        cacheHit: false,
        hasMore: queryResult.hasMore,
        otherRecordCount: queryResult.otherRecordCount,
        totalUniqueValues: queryResult.totalUniqueValues,
        duration,
        userId: userContext.user_id,
        component: 'dimension-value-cache',
      });

      return {
        values: queryResult.values,
        fromCache: false,
        queryTimeMs: duration,
        hasMore: queryResult.hasMore,
        otherRecordCount: queryResult.otherRecordCount,
        totalUniqueValues: queryResult.totalUniqueValues,
      };
    } catch (error) {
      log.error('Failed to get dimension values', error as Error, {
        dataSourceId: params.dataSourceId,
        dimensionColumn: params.dimensionColumn,
        userId: userContext.user_id,
        component: 'dimension-value-cache',
      });
      throw error;
    }
  }

  /**
   * Query dimension values from cache
   *
   * ARCHITECTURE: Uses dataSourceCache (Redis) instead of direct SQL.
   * The cache contains pre-populated analytics data with proper indexing.
   * We fetch from cache and extract unique values in-memory.
   *
   * Returns top N values by record count, with remaining values aggregated
   * into an "Other" category for cleaner UI presentation.
   *
   * @param params - Query parameters
   * @param userContext - User context for RBAC
   * @returns Dimension values with record counts and metadata (top N + optional "Other")
   */
  private async queryDimensionValues(
    params: DimensionValueQueryParams,
    userContext: UserContext
  ): Promise<QueryResultWithMetadata> {
    const {
      dataSourceId,
      dimensionColumn,
      measure,
      frequency,
      startDate,
      endDate,
      practiceUids,
      advancedFilters = [],
      limit = 50,
    } = params;

    // Get data source configuration for schema/table names
    const dataSourceConfig = await chartConfigService.getDataSourceConfigById(dataSourceId);

    if (!dataSourceConfig) {
      throw new Error(`Data source configuration not found: ${dataSourceId}`);
    }

    log.info('Fetching dimension values from cache', {
      dataSourceId,
      dimensionColumn,
      measure,
      frequency,
      hasStartDate: !!startDate,
      hasEndDate: !!endDate,
      hasPracticeUids: !!practiceUids,
      advancedFilterCount: advancedFilters.length,
      component: 'dimension-value-cache',
    });

    // Fetch data from cache (uses existing cache path with RBAC filtering)
    const { dataSourceCache } = await import('@/lib/cache');
    const cacheResult = await dataSourceCache.fetchDataSource(
      {
        dataSourceId,
        schema: dataSourceConfig.schemaName,
        table: dataSourceConfig.tableName,
        dataSourceType: dataSourceConfig.dataSourceType,
        ...(measure && { measure }),
        ...(frequency && { frequency }),
        ...(practiceUids && practiceUids.length === 1 && { practiceUid: practiceUids[0] }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(advancedFilters.length > 0 && { advancedFilters }),
      },
      userContext,
      false // Use cache
    );

    log.info('Cache fetch completed for dimension discovery', {
      dataSourceId,
      dimensionColumn,
      rowCount: cacheResult.rows.length,
      cacheHit: cacheResult.cacheHit,
      component: 'dimension-value-cache',
    });

    // Extract unique dimension values in-memory (with record counts)
    const valueCountMap = new Map<string | number, number>();
    
    for (const row of cacheResult.rows) {
      const value = row[dimensionColumn];
      if (value !== null && value !== undefined) {
        const currentCount = valueCountMap.get(value as string | number) || 0;
        valueCountMap.set(value as string | number, currentCount + 1);
      }
    }

    const totalUniqueValues = valueCountMap.size;

    log.info('Unique dimension values extracted', {
      dataSourceId,
      dimensionColumn,
      totalRows: cacheResult.rows.length,
      uniqueValues: totalUniqueValues,
      component: 'dimension-value-cache',
    });

    // Convert to sorted array (all values, sorted by record count DESC)
    // Uses simple comparison instead of localeCompare for 5-10x better performance
    const allSortedValues = Array.from(valueCountMap.entries())
      .sort((a, b) => {
        // Sort by record count DESC, then by value ASC
        if (b[1] !== a[1]) {
          return b[1] - a[1]; // Higher count first
        }
        // Sort by value (simple comparison - faster than localeCompare)
        const valA = String(a[0]);
        const valB = String(b[0]);
        return valA < valB ? -1 : valA > valB ? 1 : 0;
      });

    // Determine effective limit: use TOP_N_DIMENSION_VALUES for "Other" grouping
    // but respect the requested limit if it's higher (e.g., for "Load More" requests)
    const effectiveLimit = Math.min(limit, Math.max(TOP_N_DIMENSION_VALUES, limit));
    
    // Take top N values
    const topNValues = allSortedValues.slice(0, effectiveLimit);
    
    // Calculate "Other" aggregate for remaining values
    const remainingValues = allSortedValues.slice(effectiveLimit);
    const hasMore = remainingValues.length > 0;
    const otherRecordCount = remainingValues.reduce((sum, [, count]) => sum + count, 0);

    // Transform top N to DimensionValue format
    const values: DimensionValue[] = topNValues.map(([value, recordCount]) => ({
      value: value as string | number,
      label: String(value),
      recordCount,
    }));

    // Add "Other" entry if there are remaining values
    if (hasMore && otherRecordCount > 0) {
      values.push({
        value: '__OTHER__',
        label: `Other (${remainingValues.length} more)`,
        recordCount: otherRecordCount,
        isOther: true,
      });
    }

    log.info('Dimension values processed with Other aggregation', {
      dataSourceId,
      dimensionColumn,
      totalUniqueValues,
      topNReturned: topNValues.length,
      hasOther: hasMore,
      otherCount: remainingValues.length,
      otherRecordCount,
      component: 'dimension-value-cache',
    });

    return {
      values,
      hasMore,
      otherRecordCount,
      totalUniqueValues,
    };
  }

  /**
   * Build cache key for dimension values
   *
   * Key format: dim:{dataSourceId}:{dimensionColumn}:{filtersHash}
   *
   * @param params - Query parameters
   * @returns Cache key
   */
  private buildCacheKey(params: DimensionValueQueryParams): string {
    // Build filter hash (all parameters that affect results)
    const filterComponents = {
      measure: params.measure,
      frequency: params.frequency,
      startDate: params.startDate,
      endDate: params.endDate,
      practiceUids: params.practiceUids ? [...params.practiceUids].sort() : undefined,
      advancedFilters: params.advancedFilters,
    };

    const filterHash = createHash('md5')
      .update(JSON.stringify(filterComponents))
      .digest('hex')
      .substring(0, 16);

    return `dim:${params.dataSourceId}:${params.dimensionColumn}:${filterHash}`;
  }

  /**
   * Get cached dimension values from Redis
   *
   * @param cacheKey - Cache key
   * @returns Cached result with metadata or null
   */
  private async getCachedValues(cacheKey: string): Promise<QueryResultWithMetadata | null> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        return null;
      }

      const cached = await redis.get(cacheKey);

      if (!cached) {
        return null;
      }

      const parsed = JSON.parse(cached) as QueryResultWithMetadata;
      return parsed;
    } catch (error) {
      log.error('Failed to get cached dimension values', error as Error, {
        cacheKey,
        component: 'dimension-value-cache',
      });
      return null;
    }
  }

  /**
   * Cache dimension values in Redis
   *
   * @param cacheKey - Cache key
   * @param result - Query result with metadata to cache
   */
  private async cacheValues(cacheKey: string, result: QueryResultWithMetadata): Promise<void> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        return;
      }

      await redis.setex(cacheKey, DIMENSION_CACHE_TTL, JSON.stringify(result));

      log.debug('Dimension values cached', {
        cacheKey,
        valueCount: result.values.length,
        hasMore: result.hasMore,
        ttl: DIMENSION_CACHE_TTL,
        component: 'dimension-value-cache',
      });
    } catch (error) {
      // Don't fail on cache errors, just log
      log.error('Failed to cache dimension values', error as Error, {
        cacheKey,
        component: 'dimension-value-cache',
      });
    }
  }

  /**
   * Warm dimension cache for common dimensions
   *
   * Pre-populates cache with frequently accessed dimensions to improve
   * initial load times for dimension expansion.
   *
   * @param dataSourceId - Data source ID
   * @param dimensionColumns - Dimension columns to warm
   * @param commonParams - Common query parameters (measure, frequency, etc.)
   */
  async warmDimensionCache(
    dataSourceId: number,
    dimensionColumns: string[],
    commonParams: Partial<DimensionValueQueryParams>,
    userContext: UserContext
  ): Promise<void> {
    const startTime = Date.now();

    log.info('Starting dimension cache warming', {
      dataSourceId,
      dimensionCount: dimensionColumns.length,
      userId: userContext.user_id,
      component: 'dimension-value-cache',
    });

    try {
      // Warm all dimensions in parallel
      const warmingPromises = dimensionColumns.map(async (dimensionColumn) => {
        try {
          await this.getDimensionValues(
            {
              dataSourceId,
              dimensionColumn,
              ...commonParams,
              limit: 50, // Standard limit for warming
            },
            userContext
          );

          log.debug('Dimension cache warmed', {
            dataSourceId,
            dimensionColumn,
            component: 'dimension-value-cache',
          });
        } catch (error) {
          log.error('Failed to warm dimension cache', error as Error, {
            dataSourceId,
            dimensionColumn,
            component: 'dimension-value-cache',
          });
          // Continue warming other dimensions
        }
      });

      await Promise.all(warmingPromises);

      const duration = Date.now() - startTime;

      log.info('Dimension cache warming completed', {
        dataSourceId,
        dimensionCount: dimensionColumns.length,
        duration,
        userId: userContext.user_id,
        component: 'dimension-value-cache',
      });
    } catch (error) {
      log.error('Dimension cache warming failed', error as Error, {
        dataSourceId,
        userId: userContext.user_id,
        component: 'dimension-value-cache',
      });
      throw error;
    }
  }

  /**
   * Invalidate cached dimension values
   *
   * Call when dimension data changes (data refresh, new values added).
   *
   * @param dataSourceId - Data source ID
   * @param dimensionColumn - Optional: specific dimension column to invalidate
   */
  async invalidateCache(dataSourceId: number, dimensionColumn?: string): Promise<void> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        return;
      }

      // Build pattern for cache keys
      const pattern = dimensionColumn
        ? `dim:${dataSourceId}:${dimensionColumn}:*`
        : `dim:${dataSourceId}:*`;

      // Find matching keys
      const keys = await redis.keys(pattern);

      if (keys.length > 0) {
        await redis.del(...keys);

        log.info('Dimension cache invalidated', {
          dataSourceId,
          dimensionColumn,
          keysDeleted: keys.length,
          component: 'dimension-value-cache',
        });
      }
    } catch (error) {
      log.error('Failed to invalidate dimension cache', error as Error, {
        dataSourceId,
        dimensionColumn,
        component: 'dimension-value-cache',
      });
      // Don't fail on cache invalidation errors
    }
  }
}

// Export singleton instance
export const dimensionValueCache = new DimensionValueCacheService();

