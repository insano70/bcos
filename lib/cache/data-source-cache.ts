/**
 * Data Source Cache Service (Orchestrator)
 *
 * Redis-backed cache for analytics data source query results with in-memory RBAC filtering.
 *
 * ARCHITECTURE:
 * - Orchestrator pattern: Delegates to specialized services
 * - Cache operations: data-source/cache-operations.ts
 * - Query execution: services/analytics/data-source-query-service.ts
 * - RBAC filtering: services/analytics/rbac-filter-service.ts
 * - In-memory filtering: services/analytics/in-memory-filter-service.ts
 * - Cache warming: data-source/cache-warming.ts
 * - Statistics: data-source/cache-stats.ts
 *
 * KEY FEATURES:
 * - Secondary index sets for O(1) cache lookups (via IndexedAnalyticsCache)
 * - Granular cache keys: one entry per (datasource, measure, practice_uid, provider_uid, frequency)
 * - In-memory RBAC filtering (maximum cache reuse across users)
 * - Date range and advanced filtering
 * - Graceful degradation
 * - 48-hour TTL (data updates 1-2x daily, 24-hour staleness acceptable)
 * - Distributed locking for cache warming (prevents race conditions)
 * - Enhanced statistics (per-data-source breakdown, largest entries)
 *
 * SECURITY:
 * - Fail-closed RBAC (empty accessible_practices for non-admin → no data)
 * - Permission-based scope validation (not role-based)
 * - Dynamic column validation (prevents SQL injection)
 * - NULL provider_uid scope handling
 * - Comprehensive security audit logging
 */

import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import type { ChartFilter } from '@/lib/types/analytics';
import type { UserContext } from '@/lib/types/rbac';
import { buildChartRenderContext } from '@/lib/utils/chart-context';
import type { CacheKeyComponents } from './data-source/cache-key-builder';
import { cacheOperations } from './data-source/cache-operations';
import { cacheStatsService } from './data-source/cache-stats';
import { cacheWarmingService } from './data-source/cache-warming';
import { inMemoryFilterService } from '@/lib/services/analytics/in-memory-filter-service';
import { rbacFilterService } from '@/lib/services/analytics/rbac-filter-service';
import {
  dataSourceQueryService,
  type DataSourceQueryParams,
} from '@/lib/services/analytics/data-source-query-service';
import { db } from '@/lib/db';
import { chart_data_sources } from '@/lib/db/chart-config-schema';
import { eq } from 'drizzle-orm';

// Re-export CacheKeyComponents for external use
export type { CacheKeyComponents } from './data-source/cache-key-builder';

/**
 * Query parameters for fetchDataSource
 *
 * Supports both measure-based and table-based data sources:
 * - Measure-based: require measure + frequency
 * - Table-based: no measure/frequency required
 */
export interface CacheQueryParams {
  dataSourceId: number;
  schema: string;
  table: string;
  dataSourceType?: 'measure-based' | 'table-based';
  measure?: string; // Required for measure-based, N/A for table-based
  practiceUid?: number;
  providerUid?: number;
  frequency?: string; // Required for measure-based, N/A for table-based
  startDate?: string;
  endDate?: string;
  advancedFilters?: ChartFilter[];
}

/**
 * Result from fetchDataSource including cache metadata
 */
export interface DataSourceFetchResult {
  rows: Record<string, unknown>[];
  cacheHit: boolean;
}

/**
 * Cache for data source types (avoid repeated DB queries)
 * Key: dataSourceId, Value: data_source_type
 */
const dataSourceTypeCache = new Map<number, 'measure-based' | 'table-based'>();

/**
 * Detect data source type from database
 * Uses in-memory cache to avoid repeated queries
 *
 * @param dataSourceId - Data source ID
 * @returns Data source type ('measure-based' or 'table-based')
 */
async function detectDataSourceType(
  dataSourceId: number
): Promise<'measure-based' | 'table-based'> {
  // Check cache first
  const cached = dataSourceTypeCache.get(dataSourceId);
  if (cached) {
    return cached;
  }

  // Query database
  const result = await db
    .select({ data_source_type: chart_data_sources.data_source_type })
    .from(chart_data_sources)
    .where(eq(chart_data_sources.data_source_id, dataSourceId))
    .limit(1);

  if (!result || result.length === 0 || !result[0]) {
    log.warn('Data source not found, defaulting to measure-based', {
      dataSourceId,
      component: 'data-source-cache',
    });
    return 'measure-based';
  }

  const type = result[0].data_source_type;

  // Cache the result
  dataSourceTypeCache.set(dataSourceId, type);

  return type;
}

/**
 * Data Source Cache Service
 *
 * Main orchestrator for data source caching with RBAC filtering.
 * Delegates to specialized services for each responsibility.
 */
class DataSourceCacheService {
  /**
   * Fetch data source with caching
   * Main entry point - handles cache lookup, database fallback, and in-memory filtering
   *
   * IMPORTANT: RBAC filtering is applied in-memory AFTER cache/DB fetch
   * This allows maximum cache reuse across users with different permissions
   *
   * SECURITY: Accepts UserContext for permission validation
   * Builds ChartRenderContext internally to ensure consistent RBAC
   *
   * @param params - Query parameters
   * @param userContext - User context for RBAC
   * @param nocache - Skip cache (force database query)
   * @returns Data source fetch result
   */
  async fetchDataSource(
    params: CacheQueryParams,
    userContext: UserContext,
    nocache: boolean = false
  ): Promise<DataSourceFetchResult> {
    const startTime = Date.now();

    // Build ChartRenderContext from UserContext with proper RBAC
    // This ensures consistent accessible_practices population
    const context = await buildChartRenderContext(userContext);

    // Detect data source type if not provided
    const dataSourceType = params.dataSourceType || (await detectDataSourceType(params.dataSourceId));

    // Validate measure/frequency for measure-based sources
    if (dataSourceType === 'measure-based') {
      if (!params.measure || !params.frequency) {
        log.warn('Measure-based data source requires measure and frequency', {
          dataSourceId: params.dataSourceId,
          dataSourceType,
          measure: params.measure,
          frequency: params.frequency,
          userId: userContext.user_id,
        });
        throw new Error('Measure-based data sources require measure and frequency parameters');
      }
    }

    // Build cache key components (only from chart filters, NOT from RBAC)
    const keyComponents: CacheKeyComponents = {
      dataSourceId: params.dataSourceId,
      dataSourceType,
      ...(params.measure && { measure: params.measure }),
      ...(params.practiceUid && { practiceUid: params.practiceUid }), // Only if explicit chart filter
      ...(params.providerUid && { providerUid: params.providerUid }), // Only if explicit chart filter
      ...(params.frequency && { frequency: params.frequency }),
    };

    // Try cache first (unless nocache=true)
    if (!nocache) {
      const cacheStart = Date.now();
      const cached = await cacheOperations.getCached(keyComponents);
      const cacheDuration = Date.now() - cacheStart;

      if (cached) {
        // Apply in-memory filters (ORDER MATTERS: RBAC first for security)
        let filteredRows = cached.rows;

        // 1. RBAC filtering (SECURITY CRITICAL - applied server-side before returning to client)
        const rbacStart = Date.now();
        filteredRows = rbacFilterService.applyRBACFilter(filteredRows, context, userContext);
        const rbacDuration = Date.now() - rbacStart;

        // 2. Date range filtering (in-memory for maximum cache reuse)
        let dateFilterDuration = 0;
        if (params.startDate || params.endDate) {
          const dateStart = Date.now();
          filteredRows = await inMemoryFilterService.applyDateRangeFilter(
            filteredRows,
            params.dataSourceId,
            params.startDate,
            params.endDate
          );
          dateFilterDuration = Date.now() - dateStart;
        }

        // 3. CRITICAL FIX: Apply advanced filters (dashboard/organization filters) in-memory
        // These are NOT applied during cache population, so must be applied when serving from cache
        if (params.advancedFilters && params.advancedFilters.length > 0) {
          const rowCountBeforeAdvanced = filteredRows.length;
          filteredRows = inMemoryFilterService.applyAdvancedFilters(
            filteredRows,
            params.advancedFilters
          );

          log.info('Advanced filters applied in-memory (cache hit path)', {
            userId: context.user_id,
            filterCount: params.advancedFilters.length,
            filters: params.advancedFilters,
            beforeFilter: rowCountBeforeAdvanced,
            afterFilter: filteredRows.length,
            rowsFiltered: rowCountBeforeAdvanced - filteredRows.length,
          });
        }

        const duration = Date.now() - startTime;

        log.info('Data source served from cache (server-filtered)', {
          cacheKey: cached.cacheKey,
          cacheLevel: cached.cacheLevel,
          cachedRowCount: cached.rows.length,
          afterRBAC: filteredRows.length,
          finalRowCount: filteredRows.length,
          duration,
          slow: duration > SLOW_THRESHOLDS.API_OPERATION,
          timingBreakdown: {
            cacheFetch: cacheDuration,
            rbacFilter: rbacDuration,
            dateFilter: dateFilterDuration,
            total: duration,
          },
          userId: context.user_id,
          permissionScope: context.permission_scope,
          security: 'filtered_before_client_send',
        });

        return {
          rows: filteredRows,
          cacheHit: true,
        };
      }
    }

    // Cache miss - query database
    log.info('Data source cache miss - querying database', {
      dataSourceId: params.dataSourceId,
      measure: params.measure,
      practiceUid: params.practiceUid,
      nocache,
      userId: context.user_id,
    });

    // Build query params for data source query service
    const queryParams: DataSourceQueryParams = {
      dataSourceId: params.dataSourceId,
      schema: params.schema,
      table: params.table,
      dataSourceType,
      ...(params.measure && { measure: params.measure }),
      ...(params.practiceUid && { practiceUid: params.practiceUid }),
      ...(params.providerUid && { providerUid: params.providerUid }),
      ...(params.frequency && { frequency: params.frequency }),
      ...(params.startDate && { startDate: params.startDate }),
      ...(params.endDate && { endDate: params.endDate }),
      ...(params.advancedFilters && { advancedFilters: params.advancedFilters }),
    };

    const rows = await dataSourceQueryService.queryDataSource(queryParams, userContext);

    // Cache the result (unless nocache=true)
    if (!nocache && rows.length > 0) {
      await cacheOperations.setCached(keyComponents, rows);
    }

    // Apply in-memory filters (ORDER MATTERS: RBAC first for security)
    let filteredRows = rows;

    // 1. RBAC filtering (SECURITY CRITICAL - applied server-side before returning to client)
    filteredRows = rbacFilterService.applyRBACFilter(filteredRows, context, userContext);

    // 2. Date range filtering (in-memory for maximum cache reuse)
    if (params.startDate || params.endDate) {
      filteredRows = await inMemoryFilterService.applyDateRangeFilter(
        filteredRows,
        params.dataSourceId,
        params.startDate,
        params.endDate
      );
    }

    // 3. Apply advanced filters (in-memory for consistency with cache path)
    // Advanced filters are ALSO applied in SQL query, but we apply them in-memory as well
    // to ensure consistency between cached and non-cached paths, and to handle type coercion
    if (params.advancedFilters && params.advancedFilters.length > 0) {
      const rowCountBefore = filteredRows.length;
      filteredRows = inMemoryFilterService.applyAdvancedFilters(
        filteredRows,
        params.advancedFilters
      );

      log.info('Advanced filters applied in-memory (nocache path)', {
        userId: context.user_id,
        filterCount: params.advancedFilters.length,
        filters: params.advancedFilters,
        beforeFilter: rowCountBefore,
        afterFilter: filteredRows.length,
        rowsFiltered: rowCountBefore - filteredRows.length,
        source: 'cache_miss_path',
      });
    }

    const duration = Date.now() - startTime;

    log.info('Data source fetched from database (server-filtered)', {
      totalRowCount: rows.length,
      afterRBAC: filteredRows.length,
      finalRowCount: filteredRows.length,
      duration,
      slow: duration > SLOW_THRESHOLDS.API_OPERATION,
      userId: context.user_id,
      permissionScope: context.permission_scope,
      security: 'filtered_before_client_send',
    });

    return {
      rows: filteredRows,
      cacheHit: false,
    };
  }

  /**
   * Invalidate cache entries
   *
   * @param dataSourceId - Optional data source ID
   * @param measure - Optional measure filter (measure-based only)
   * @param dataSourceType - Optional type filter
   */
  async invalidate(
    dataSourceId?: number,
    measure?: string,
    dataSourceType?: 'measure-based' | 'table-based'
  ): Promise<void> {
    await cacheOperations.invalidate(dataSourceId, measure, dataSourceType);
  }

  /**
   * Get enhanced cache statistics
   *
   * @returns Cache statistics
   */
  async getStats(): Promise<{
    totalKeys: number;
    totalMemoryMB: number;
    cacheKeys: string[];
    keysByLevel: Record<string, number>;
    byDataSource: Record<
      number,
      {
        keys: number;
        memoryMB: number;
        measures: string[];
      }
    >;
    largestEntries: Array<{
      key: string;
      sizeMB: number;
      rowCount?: number;
    }>;
  }> {
    return await cacheStatsService.getStats();
  }

  /**
   * Warm cache for a specific data source
   *
   * @param dataSourceId - Data source ID to warm
   * @returns Warming result
   */
  async warmDataSource(dataSourceId: number): Promise<{
    entriesCached: number;
    totalRows: number;
    duration: number;
    skipped?: boolean;
  }> {
    return await cacheWarmingService.warmDataSource(dataSourceId);
  }

  /**
   * Warm cache for all active data sources
   *
   * @returns Warming result for all data sources
   */
  async warmAllDataSources(): Promise<{
    dataSourcesWarmed: number;
    totalEntriesCached: number;
    totalRows: number;
    duration: number;
  }> {
    return await cacheWarmingService.warmAllDataSources();
  }
}

export const dataSourceCache = new DataSourceCacheService();
