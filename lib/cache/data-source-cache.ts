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
 * LRU cache for data source types (max 500 entries)
 * Prevents unbounded memory growth in long-running processes
 * Set to 500 to accommodate organizations with many data sources
 */
const dataSourceTypeCache = new LRUCache<number, 'measure-based' | 'table-based'>(500);

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
   * REQUEST-LEVEL DEDUPLICATION (PARALLEL-SAFE):
   * Uses getOrFetch() to ensure that when multiple charts request the same
   * (measure + frequency) in parallel, only ONE Redis fetch occurs.
   * Other charts wait for the first fetch to complete and share the result.
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

    // PHASE 2 OPTIMIZATION: Compute effective practices for cache query
    // This accounts for:
    // 1. Permission scope (all, organization, own, none)
    // 2. RBAC accessible_practices (what user CAN access)
    // 3. Runtime practice filter from advancedFilters (what user WANTS to see)
    const effectivePractices = computeEffectivePractices(
      context.accessible_practices,
      params.advancedFilters,
      context.permission_scope ?? 'none' // Default to 'none' for fail-closed security
    );

    // Define the fetch function for raw data (Redis or DB)
    // This is called ONCE per unique cache key, even with parallel requests
    const fetchRawData = async (): Promise<DataSourceFetchResult> => {
      // Try Redis cache (unless nocache=true)
      if (!nocache) {
        const cacheStart = Date.now();

        log.debug('Starting cache lookup (deduped)', {
          dataSourceId: params.dataSourceId,
          measure: params.measure,
          frequency: params.frequency,
          effectivePracticeCount: effectivePractices?.length ?? 0,
          component: 'data-source-cache',
        });

        const cached = await cacheOperations.getCached(keyComponents, effectivePractices);
        const cacheDuration = Date.now() - cacheStart;

        if (cached) {
          log.info('Cache lookup completed (will be shared with parallel requests)', {
            dataSourceId: params.dataSourceId,
            cacheHit: true,
            cacheDuration,
            rowCount: cached.rows.length,
            component: 'data-source-cache',
          });

          return {
            rows: cached.rows,
            cacheHit: true,
          };
        }

        log.debug('Cache miss', {
          dataSourceId: params.dataSourceId,
          cacheDuration,
          component: 'data-source-cache',
        });
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

      return {
        rows,
        cacheHit: false,
      };
    };

    // Get raw data with parallel deduplication
    // If requestCache is provided, uses getOrFetch for deduplication
    // Otherwise, fetches directly
    let rawResult: DataSourceFetchResult;

    if (!nocache && requestCache) {
      // PARALLEL-SAFE: Use getOrFetch to ensure only one fetch per unique key
      // Other parallel requests for the same key will wait and share the result
      rawResult = await requestCache.getOrFetch(params, fetchRawData);
    } else {
      // No request cache or nocache=true, fetch directly
      rawResult = await fetchRawData();
    }

    // Apply in-memory filters to raw data (ORDER MATTERS: RBAC first for security)
    // These filters are user/request-specific, so applied AFTER cache deduplication
    let filteredRows = rawResult.rows as Record<string, unknown>[];
    const filterStartTime = Date.now();

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

    // 3. Apply advanced filters (dashboard/organization filters) in-memory
    if (params.advancedFilters && params.advancedFilters.length > 0) {
      const rowCountBeforeAdvanced = filteredRows.length;
      filteredRows = inMemoryFilterService.applyAdvancedFilters(
        filteredRows,
        params.advancedFilters
      );

      log.debug('Advanced filters applied in-memory', {
        userId: context.user_id,
        filterCount: params.advancedFilters.length,
        beforeFilter: rowCountBeforeAdvanced,
        afterFilter: filteredRows.length,
        rowsFiltered: rowCountBeforeAdvanced - filteredRows.length,
      });
    }

    const duration = Date.now() - startTime;
    const filterDuration = Date.now() - filterStartTime;

    log.info('Data source fetch completed', {
      dataSourceId: params.dataSourceId,
      measure: params.measure,
      frequency: params.frequency,
      cachedRowCount: rawResult.rows.length,
      afterRBAC: filteredRows.length,
      finalRowCount: filteredRows.length,
      duration,
      slow: duration > SLOW_THRESHOLDS.API_OPERATION,
      cacheHit: rawResult.cacheHit,
      timingBreakdown: {
        rawFetch: duration - filterDuration,
        rbacFilter: rbacDuration,
        dateFilter: dateFilterDuration,
        total: duration,
      },
      userId: context.user_id,
      permissionScope: context.permission_scope,
      requestCacheUsed: Boolean(requestCache),
      security: 'filtered_before_client_send',
      component: 'data-source-cache',
    });

    return {
      rows: filteredRows,
      cacheHit: rawResult.cacheHit,
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
