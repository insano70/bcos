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

// Re-export CacheKeyComponents for external use
export type { CacheKeyComponents } from './data-source/cache-key-builder';

/**
 * Query parameters for fetchDataSource
 */
export interface CacheQueryParams {
  dataSourceId: number;
  schema: string;
  table: string;
  measure?: string;
  practiceUid?: number;
  providerUid?: number;
  frequency?: string;
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

    // Build cache key components (only from chart filters, NOT from RBAC)
    const keyComponents: CacheKeyComponents = {
      dataSourceId: params.dataSourceId,
      ...(params.measure && { measure: params.measure }),
      ...(params.practiceUid && { practiceUid: params.practiceUid }), // Only if explicit chart filter
      ...(params.providerUid && { providerUid: params.providerUid }), // Only if explicit chart filter
      ...(params.frequency && { frequency: params.frequency }),
    };

    // Try cache first (unless nocache=true)
    if (!nocache) {
      const cached = await cacheOperations.getCached(keyComponents);

      if (cached) {
        // Apply in-memory filters (ORDER MATTERS: RBAC first for security)
        let filteredRows = cached.rows;

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

    // 3. CRITICAL FIX: Apply advanced filters if NOT applied in SQL
    // Note: Advanced filters ARE applied in SQL query (Task 1.5), but as a safety measure,
    // we verify and log if they would have filtered additional rows (indicates SQL issue)
    if (params.advancedFilters && params.advancedFilters.length > 0) {
      const rowCountBefore = filteredRows.length;
      const testFiltered = inMemoryFilterService.applyAdvancedFilters(
        filteredRows,
        params.advancedFilters
      );

      if (testFiltered.length !== rowCountBefore) {
        log.error('Advanced filters NOT applied in SQL - applying in-memory as fallback', {
          userId: context.user_id,
          filterCount: params.advancedFilters.length,
          filters: params.advancedFilters,
          beforeFilter: rowCountBefore,
          afterFilter: testFiltered.length,
          rowsFiltered: rowCountBefore - testFiltered.length,
          source: 'cache_miss_path',
          action: 'fallback_applied',
        });
        filteredRows = testFiltered;
      }
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
   * @param measure - Optional measure filter
   */
  async invalidate(dataSourceId?: number, measure?: string): Promise<void> {
    await cacheOperations.invalidate(dataSourceId, measure);
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
