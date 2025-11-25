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
import type { RequestScopedCache } from './request-scoped-cache';

// Re-export CacheKeyComponents for external use
export type { CacheKeyComponents } from './data-source/cache-key-builder';

/**
 * Extract practice_uid filter values from advancedFilters
 * Looks for filters with field='practice_uid' and operator='in'
 *
 * @param advancedFilters - Array of chart filters
 * @returns Array of practice UIDs from filter, or undefined if no practice filter
 */
function extractPracticeFilterFromAdvanced(
  advancedFilters?: ChartFilter[]
): number[] | undefined {
  if (!advancedFilters || advancedFilters.length === 0) {
    return undefined;
  }

  // Find practice_uid filter with 'in' operator
  const practiceFilter = advancedFilters.find(
    (f) => f.field === 'practice_uid' && f.operator === 'in'
  );

  if (!practiceFilter) {
    return undefined;
  }

  // Extract practice UIDs from filter value
  const filterValue = practiceFilter.value;
  if (Array.isArray(filterValue)) {
    // Filter to only numeric values and convert strings if needed
    const numericValues: number[] = [];
    for (const v of filterValue) {
      if (typeof v === 'number') {
        numericValues.push(v);
      } else if (typeof v === 'string') {
        const parsed = parseInt(v, 10);
        if (!Number.isNaN(parsed)) {
          numericValues.push(parsed);
        }
      }
    }
    return numericValues.length > 0 ? numericValues : undefined;
  }

  return undefined;
}

/**
 * Compute effective practices for cache query
 *
 * Returns the appropriate practice filter based on:
 * 1. Permission scope (what level of access user has)
 * 2. RBAC accessible_practices (what user CAN access - security boundary)
 * 3. Runtime practice filter from advancedFilters (what user WANTS to see)
 *
 * This ensures:
 * - A super user with runtime filter = 1 practice only fetches that practice's data
 * - A regular user can never access practices outside their RBAC scope
 * - If no runtime filter, returns appropriate practices for the scope
 *
 * @param accessiblePractices - Practices user can access (from RBAC)
 * @param advancedFilters - Runtime filters (may contain practice_uid filter)
 * @param permissionScope - User's permission scope ('all', 'organization', 'own', 'none')
 * @returns Practices to filter by for cache query
 */
function computeEffectivePractices(
  accessiblePractices: number[] | undefined,
  advancedFilters: ChartFilter[] | undefined,
  permissionScope: 'all' | 'organization' | 'own' | 'none'
): number[] | undefined {
  // Extract runtime practice filter
  const runtimePracticeFilter = extractPracticeFilterFromAdvanced(advancedFilters);

  // For 'all' scope (super admin), accessiblePractices is [] meaning "no restrictions"
  // In this case, runtime filter directly controls what to fetch
  if (permissionScope === 'all') {
    // Super admin with runtime filter: use the filter directly
    if (runtimePracticeFilter && runtimePracticeFilter.length > 0) {
      return runtimePracticeFilter;
    }
    // Super admin with no filter: no practice filtering (undefined means all)
    return undefined;
  }

  // For 'none' scope, return undefined to let RBAC fail-close later
  if (permissionScope === 'none') {
    return undefined;
  }

  // For 'organization' and 'own' scopes:
  // accessiblePractices contains the actual practices they can access
  
  // No runtime filter: use RBAC scope
  if (!runtimePracticeFilter || runtimePracticeFilter.length === 0) {
    // Return accessible practices if they exist
    if (accessiblePractices && accessiblePractices.length > 0) {
      return accessiblePractices;
    }
    // No practices accessible (fail-closed for non-admin)
    return undefined;
  }

  // Has runtime filter: compute intersection with RBAC scope
  // SECURITY: Runtime filter can only NARROW the scope, never widen it
  if (accessiblePractices && accessiblePractices.length > 0) {
    const rbacSet = new Set(accessiblePractices);
    const intersection = runtimePracticeFilter.filter((p) => rbacSet.has(p));
    
    // Return intersection if not empty
    if (intersection.length > 0) {
      return intersection;
    }
    // Intersection is empty - user requested practices outside their scope
    // Return empty to signal no valid practices (will fail-close later)
    return [];
  }

  // Non-admin with no RBAC practices but has runtime filter - fail closed
  return undefined;
}

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
/**
 * Simple LRU Cache implementation for data source types
 *
 * Prevents memory leak by enforcing a maximum size limit.
 * When the cache is full, the least recently used entry is evicted.
 */
class LRUCache<K, V> {
  private cache: Map<K, V>;
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    // Delete if exists (to update position)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Add to end (most recently used)
    this.cache.set(key, value);

    // Evict oldest if over limit
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value as K;
      this.cache.delete(firstKey);

      log.debug('LRU cache evicted oldest entry', {
        evictedKey: firstKey,
        cacheSize: this.cache.size,
        maxSize: this.maxSize,
        component: 'data-source-type-cache',
      });
    }
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * LRU cache for data source types (max 100 entries)
 * Prevents unbounded memory growth in long-running processes
 */
const dataSourceTypeCache = new LRUCache<number, 'measure-based' | 'table-based'>(100);

/**
 * Detect data source type from database
 * Uses LRU cache to avoid repeated queries while preventing memory leaks
 *
 * SECURITY: Validates input and database return values
 *
 * @param dataSourceId - Data source ID
 * @returns Data source type ('measure-based' or 'table-based')
 */
async function detectDataSourceType(
  dataSourceId: number
): Promise<'measure-based' | 'table-based'> {
  // SECURITY: Validate input
  if (!Number.isInteger(dataSourceId) || dataSourceId <= 0) {
    throw new Error(`Invalid dataSourceId: ${dataSourceId}. Must be positive integer.`);
  }

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

  // SECURITY: Validate database return value
  if (type !== 'measure-based' && type !== 'table-based') {
    log.error('Invalid data source type from database, defaulting to measure-based', {
      dataSourceId,
      invalidType: type,
      component: 'data-source-cache',
    });
    return 'measure-based';
  }

  // Cache the result with LRU eviction
  dataSourceTypeCache.set(dataSourceId, type);

  log.debug('Data source type cached', {
    dataSourceId,
    type,
    cacheSize: dataSourceTypeCache.size(),
    component: 'data-source-type-cache',
  });

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
   * REQUEST-LEVEL DEDUPLICATION:
   * When requestCache is provided, results are cached in-memory for the duration
   * of the request. Multiple charts requesting the same (measure + frequency)
   * will share a single Redis fetch, dramatically reducing redundant data transfer.
   *
   * @param params - Query parameters
   * @param userContext - User context for RBAC
   * @param nocache - Skip cache (force database query)
   * @param requestCache - Optional request-scoped cache for deduplication
   * @returns Data source fetch result
   */
  async fetchDataSource(
    params: CacheQueryParams,
    userContext: UserContext,
    nocache: boolean = false,
    requestCache?: RequestScopedCache
  ): Promise<DataSourceFetchResult> {
    const startTime = Date.now();

    // Build ChartRenderContext from UserContext with proper RBAC
    // This ensures consistent accessible_practices population
    const context = await buildChartRenderContext(userContext);

    // Detect data source type if not provided
    const dataSourceType = params.dataSourceType || (await detectDataSourceType(params.dataSourceId));

    // Validate frequency for measure-based sources (measure optional for multi-series charts)
    if (dataSourceType === 'measure-based') {
      if (!params.frequency) {
        log.warn('Measure-based data source requires frequency', {
          dataSourceId: params.dataSourceId,
          dataSourceType,
          measure: params.measure,
          frequency: params.frequency,
          userId: userContext.user_id,
        });
        throw new Error('Measure-based data sources require frequency parameter');
      }
      // Note: measure is optional for multi-series charts and dimension discovery
      // Multi-series charts have seriesConfigs with individual measures per series
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

    // REQUEST-LEVEL DEDUPLICATION: Check request-scoped cache first
    // This prevents redundant Redis fetches when multiple charts request the same data
    if (!nocache && requestCache) {
      const requestCached = requestCache.get(params);
      if (requestCached) {
        // Apply in-memory filters to the cached raw data
        let filteredRows = requestCached.rows as Record<string, unknown>[];

        // 1. RBAC filtering (SECURITY CRITICAL)
        filteredRows = rbacFilterService.applyRBACFilter(filteredRows, context, userContext);

        // 2. Date range filtering
        if (params.startDate || params.endDate) {
          filteredRows = await inMemoryFilterService.applyDateRangeFilter(
            filteredRows,
            params.dataSourceId,
            params.startDate,
            params.endDate
          );
        }

        // 3. Advanced filters
        if (params.advancedFilters && params.advancedFilters.length > 0) {
          filteredRows = inMemoryFilterService.applyAdvancedFilters(
            filteredRows,
            params.advancedFilters
          );
        }

        const duration = Date.now() - startTime;
        log.info('Data source served from request-scoped cache', {
          dataSourceId: params.dataSourceId,
          measure: params.measure,
          frequency: params.frequency,
          cachedRowCount: requestCached.rows.length,
          finalRowCount: filteredRows.length,
          duration,
          component: 'data-source-cache',
        });

        return {
          rows: filteredRows,
          cacheHit: true, // Report as cache hit (it was cached, just at request level)
        };
      }
    }

    // Try Redis cache (unless nocache=true)
    if (!nocache) {
      const cacheStart = Date.now();
      
      // PHASE 2 OPTIMIZATION: Compute effective practices for cache query
      // This accounts for:
      // 1. Permission scope (all, organization, own, none)
      // 2. RBAC accessible_practices (what user CAN access)
      // 3. Runtime practice filter from advancedFilters (what user WANTS to see)
      // This ensures a super user with runtime filter = 1 practice doesn't get all data
      const effectivePractices = computeEffectivePractices(
        context.accessible_practices,
        params.advancedFilters,
        context.permission_scope ?? 'none' // Default to 'none' for fail-closed security
      );
      
      log.info('Starting cache lookup', {
        dataSourceId: params.dataSourceId,
        measure: params.measure,
        frequency: params.frequency,
        practiceUid: params.practiceUid,
        permissionScope: context.permission_scope,
        rbacPracticeCount: context.accessible_practices?.length ?? 0,
        runtimePracticeFilter: extractPracticeFilterFromAdvanced(params.advancedFilters),
        effectivePractices: effectivePractices,
        effectivePracticeCount: effectivePractices?.length ?? 0,
        usingPracticeFilter: Boolean(effectivePractices && effectivePractices.length > 0),
        component: 'data-source-cache',
      });
      
      const cached = await cacheOperations.getCached(keyComponents, effectivePractices);
      const cacheDuration = Date.now() - cacheStart;
      log.info('Cache lookup completed', {
        dataSourceId: params.dataSourceId,
        cacheHit: !!cached,
        cacheDuration,
        rowCount: cached?.rows?.length,
        component: 'data-source-cache',
      });

      if (cached) {
        // Store raw data in request-scoped cache for deduplication
        // This allows subsequent requests for the same (measure + frequency) to skip Redis
        if (requestCache) {
          requestCache.set(params, { rows: cached.rows, cacheHit: true });
        }

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
    const dbQueryStart = Date.now();
    log.warn('Data source cache miss - falling back to database query', {
      dataSourceId: params.dataSourceId,
      measure: params.measure,
      practiceUid: params.practiceUid,
      frequency: params.frequency,
      nocache,
      userId: context.user_id,
      keyComponents,
      note: 'PERFORMANCE: This database fallback may cause slow chart loads',
      component: 'data-source-cache',
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
    const dbQueryDuration = Date.now() - dbQueryStart;
    
    log.warn('Database query completed (cache miss path)', {
      dataSourceId: params.dataSourceId,
      measure: params.measure,
      rowCount: rows.length,
      dbQueryDuration,
      slow: dbQueryDuration > 5000,
      component: 'data-source-cache',
    });

    // REMOVED: Query-time caching no longer needed - warming handles all cache population
    // This prevents creating incompatible OLD format keys (datasource:1:m:...)
    // Only the indexed analytics cache warming system should create cache entries
    // in the NEW format (cache:{ds:1}:...)

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
