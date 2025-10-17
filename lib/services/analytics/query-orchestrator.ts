/**
 * Query Orchestrator Module
 *
 * Main entry point for analytics queries. Routes between cache and legacy paths.
 * Preserves existing queryMeasures() API while delegating to specialized handlers.
 *
 * DUAL-PATH ARCHITECTURE:
 * 1. Cache Path: UserContext + data_source_id → DataSourceCacheService
 *    - RBAC filtering in-memory (maximum cache reuse)
 *    - O(1) index lookups
 *    - 4-hour TTL with warming
 *
 * 2. Legacy Path: ChartRenderContext OR missing data_source_id → QueryExecutor
 *    - RBAC filtering in SQL (fail-closed security)
 *    - Direct database queries
 *    - Backward compatibility
 *
 * ROUTING LOGIC:
 * - Multiple series? → Delegate to QueryExecutor.executeMultipleSeries()
 * - Period comparison? → Delegate to QueryExecutor.executePeriodComparison()
 * - UserContext + data_source_id? → Cache path
 * - Otherwise? → Legacy path
 *
 * KEY METHODS:
 * - queryMeasures(): Main entry point (public API)
 * - executeCachePath(): Cache path logic
 * - executeLegacyPath(): Legacy path logic (delegates to QueryExecutor)
 * - executeBaseQuery(): Used by period comparison to avoid infinite recursion
 */

import { type CacheQueryParams, dataSourceCache } from '@/lib/cache';
import { log } from '@/lib/logger';
import { chartConfigService } from '@/lib/services/chart-config-service';
import type {
  AggAppMeasure,
  AnalyticsQueryParams,
  AnalyticsQueryResult,
  ChartRenderContext,
} from '@/lib/types/analytics';
import type { UserContext } from '@/lib/types/rbac';
import { queryExecutor } from './query-executor';
import { queryValidator } from './query-validator';

/**
 * Query orchestrator - routes between cache and legacy paths
 * Main entry point for all analytics queries
 */
export class QueryOrchestrator {
  /**
   * Extract provider_uid from params
   * Checks params.provider_uid and advanced_filters
   */
  private extractProviderUid(params: AnalyticsQueryParams): number | undefined {
    // Direct provider_uid param
    if (params.provider_uid) {
      return typeof params.provider_uid === 'number'
        ? params.provider_uid
        : parseInt(String(params.provider_uid), 10);
    }

    // Check advanced filters for provider_uid
    if (params.advanced_filters) {
      const providerFilter = params.advanced_filters.find(
        (f) => f.field === 'provider_uid' && f.operator === 'eq'
      );

      if (providerFilter && typeof providerFilter.value === 'number') {
        return providerFilter.value;
      }
    }

    return undefined;
  }

  /**
   * Calculate total count from filtered rows using MeasureAccessor
   * Delegates to QueryExecutor
   */
  private async calculateTotal(rows: AggAppMeasure[], dataSourceId: number): Promise<number> {
    return await queryExecutor.calculateTotal(rows, dataSourceId);
  }

  /**
   * Execute cache path (UserContext + data_source_id)
   * Uses DataSourceCacheService with in-memory RBAC filtering
   */
  private async executeCachePath(
    params: AnalyticsQueryParams,
    userContext: UserContext,
    tableName: string,
    schemaName: string,
    startTime: number
  ): Promise<AnalyticsQueryResult> {
    // Type guard: data_source_id is required for cache path
    if (!params.data_source_id) {
      throw new Error('data_source_id is required for cache path');
    }

    // Extract provider_uid from params
    const providerUid = this.extractProviderUid(params);

    // Build cache query params
    const cacheParams: CacheQueryParams = {
      dataSourceId: params.data_source_id,
      schema: schemaName,
      table: tableName,

      // Cache key components (only include if defined)
      ...(params.measure && { measure: params.measure }),
      ...(params.practice_uid && { practiceUid: params.practice_uid }),
      ...(providerUid && { providerUid: providerUid }),
      ...(params.frequency && { frequency: params.frequency }),

      // In-memory filters (NOT in cache key)
      ...(params.start_date && { startDate: params.start_date }),
      ...(params.end_date && { endDate: params.end_date }),
      ...(params.advanced_filters && { advancedFilters: params.advanced_filters }),
    };

    // Fetch with caching (passing UserContext - ChartRenderContext built internally)
    const fetchResult = await dataSourceCache.fetchDataSource(
      cacheParams,
      userContext, // Pass UserContext (fetchDataSource builds ChartRenderContext internally)
      params.nocache || false
    );

    // Calculate total using MeasureAccessor for dynamic column access
    const totalCount = await this.calculateTotal(
      fetchResult.rows as AggAppMeasure[],
      params.data_source_id
    );

    const duration = Date.now() - startTime;

    const result: AnalyticsQueryResult = {
      data: fetchResult.rows as AggAppMeasure[],
      total_count: totalCount,
      query_time_ms: duration,
      cache_hit: fetchResult.cacheHit,
    };

    log.info('Analytics query completed (with caching)', {
      dataSourceId: params.data_source_id,
      measure: params.measure,
      practiceUid: params.practice_uid,
      rowCount: fetchResult.rows.length,
      totalCount,
      duration,
      cacheHit: fetchResult.cacheHit,
      userId: userContext.user_id,
    });

    return result;
  }

  /**
   * Execute legacy path (ChartRenderContext or missing data_source_id)
   * Uses QueryExecutor with RBAC in SQL
   */
  private async executeLegacyPath(
    params: AnalyticsQueryParams,
    context: ChartRenderContext
  ): Promise<AnalyticsQueryResult> {
    return await queryExecutor.executeLegacyQuery(params, context);
  }

  /**
   * Execute base query without period comparison or multiple series logic
   * Used internally by period comparison to avoid infinite recursion
   */
  async executeBaseQuery(
    params: AnalyticsQueryParams,
    contextOrUserContext: ChartRenderContext | UserContext
  ): Promise<AnalyticsQueryResult> {
    const isUserContext = 'email' in contextOrUserContext;
    const context = isUserContext ? undefined : (contextOrUserContext as ChartRenderContext);
    const userContext = isUserContext ? (contextOrUserContext as UserContext) : undefined;

    // Validate and get data source config
    let dataSourceConfig = null;
    let tableName = 'agg_app_measures';
    let schemaName = 'ih';

    if (params.data_source_id) {
      dataSourceConfig = await chartConfigService.getDataSourceConfigById(params.data_source_id);

      if (dataSourceConfig) {
        tableName = dataSourceConfig.tableName;
        schemaName = dataSourceConfig.schemaName;
      }
    }

    await queryValidator.validateTable(tableName, schemaName, dataSourceConfig);

    // If UserContext + data_source_id: use cache path
    if (isUserContext && userContext && params.data_source_id) {
      return await this.executeCachePath(params, userContext, tableName, schemaName, Date.now());
    }

    // Otherwise: use legacy path
    // If we have UserContext but no data_source_id, build ChartRenderContext
    let legacyContext = context;
    if (isUserContext && userContext && !context) {
      const { buildChartRenderContext } = await import('@/lib/utils/chart-context');
      legacyContext = await buildChartRenderContext(userContext);
      log.info('Built ChartRenderContext for legacy path', {
        userId: userContext.user_id,
        permissionScope: legacyContext.permission_scope,
        reason: 'missing_data_source_id',
      });
    }

    return await this.executeLegacyPath(params, legacyContext as ChartRenderContext);
  }

  /**
   * Main query method - routes between cache and legacy paths
   * Preserves existing API signature
   *
   * ROUTING LOGIC:
   * 1. Multiple series? → QueryExecutor.executeMultipleSeries()
   * 2. Period comparison? → QueryExecutor.executePeriodComparison()
   * 3. UserContext + data_source_id? → Cache path
   * 4. Otherwise? → Legacy path
   *
   * @param params - Query parameters
   * @param contextOrUserContext - Chart render context or user context
   * @returns Query result with data and metadata
   */
  async queryMeasures(
    params: AnalyticsQueryParams,
    contextOrUserContext: ChartRenderContext | UserContext
  ): Promise<AnalyticsQueryResult> {
    const startTime = Date.now();

    // Determine if we received UserContext or ChartRenderContext
    const isUserContext = 'email' in contextOrUserContext;
    const userContext = isUserContext ? (contextOrUserContext as UserContext) : undefined;
    const context = isUserContext ? undefined : (contextOrUserContext as ChartRenderContext);
    const userId = isUserContext ? userContext?.user_id : context?.user_id;

    try {
      // If multiple series are requested, handle them separately
      if (params.multiple_series && params.multiple_series.length > 0) {
        return await queryExecutor.executeMultipleSeries(
          params,
          contextOrUserContext,
          // Delegate back to this.queryMeasures for each series
          this.queryMeasures.bind(this)
        );
      }

      // If period comparison is requested, handle it separately
      if (params.period_comparison?.enabled) {
        return await queryExecutor.executePeriodComparison(
          params,
          contextOrUserContext,
          // Delegate to executeBaseQuery to avoid infinite recursion
          this.executeBaseQuery.bind(this)
        );
      }

      log.info('Building analytics query with caching', {
        params: { ...params, limit: params.limit || 1000 },
        userId,
      });

      // Get data source configuration if data_source_id is provided
      let dataSourceConfig = null;
      let tableName = 'agg_app_measures'; // Default fallback for backwards compatibility
      let schemaName = 'ih';

      if (params.data_source_id) {
        // Use data_source_id directly to get config from cache
        dataSourceConfig = await chartConfigService.getDataSourceConfigById(params.data_source_id);

        if (dataSourceConfig) {
          tableName = dataSourceConfig.tableName;
          schemaName = dataSourceConfig.schemaName;
        }
      }

      // Validate table access - pass config to avoid redundant lookup
      await queryValidator.validateTable(tableName, schemaName, dataSourceConfig);

      // ===== CACHE PATH: UserContext + data_source_id =====
      if (isUserContext && userContext && params.data_source_id) {
        return await this.executeCachePath(params, userContext, tableName, schemaName, startTime);
      }

      // ===== LEGACY PATH: ChartRenderContext OR missing data_source_id =====

      // If we have UserContext but no data_source_id, build ChartRenderContext for legacy path
      let legacyContext = context;
      if (isUserContext && userContext && !context) {
        const { buildChartRenderContext } = await import('@/lib/utils/chart-context');
        legacyContext = await buildChartRenderContext(userContext);
        log.info('Built ChartRenderContext for legacy path', {
          userId: userContext.user_id,
          permissionScope: legacyContext.permission_scope,
          reason: 'missing_data_source_id',
        });
      }

      return await this.executeLegacyPath(params, legacyContext as ChartRenderContext);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error('Analytics query failed', error, {
        params,
        userId: userId,
      });

      throw new Error(`Query execution failed: ${errorMessage}`);
    }
  }
}

// Export singleton instance
export const queryOrchestrator = new QueryOrchestrator();
