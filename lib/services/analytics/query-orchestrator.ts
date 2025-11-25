/**
 * Query Orchestrator Module
 *
 * Main entry point for analytics queries. All queries now use the cache path.
 * Preserves existing queryMeasures() API while simplifying to single path architecture.
 *
 * UNIFIED CACHE ARCHITECTURE:
 * - All queries use DataSourceCacheService
 * - RBAC filtering in-memory (maximum cache reuse)
 * - O(1) index lookups
 * - 48-hour TTL with warming
 * - Supports nocache flag for previews
 *
 * ROUTING LOGIC:
 * - Multiple series? → Execute each series in parallel (hits cache per measure)
 * - Period comparison? → Execute current + comparison period in parallel
 * - Standard query? → Cache path with optional nocache flag
 *
 * KEY METHODS:
 * - queryMeasures(): Main entry point (public API) - NOW REQUIRES UserContext + data_source_id
 * - executeCachePath(): Cache path logic
 * - executeMultipleSeries(): Handle multi-series charts (inline)
 * - executePeriodComparison(): Handle period comparison (inline)
 */

import { type CacheQueryParams, dataSourceCache } from '@/lib/cache';
import type { RequestScopedCache } from '@/lib/cache/request-scoped-cache';
import { log } from '@/lib/logger';
import { chartConfigService } from '@/lib/services/chart-config-service';
import type {
  AggAppMeasure,
  AnalyticsQueryParams,
  AnalyticsQueryResult,
} from '@/lib/types/analytics';
import type { UserContext } from '@/lib/types/rbac';
import { queryValidator } from './query-validator';

/**
 * Query orchestrator - simplified to use only cache path
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
   * Calculate total count from filtered rows
   * For analytics data, total count is simply the number of rows returned
   */
  private calculateTotal(rows: AggAppMeasure[]): number {
    return rows.length;
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
    startTime: number,
    requestCache?: RequestScopedCache
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
      ...(params.data_source_type && { dataSourceType: params.data_source_type }),
      ...(params.measure && { measure: params.measure }),
      ...(params.practice_uid && { practiceUid: params.practice_uid }),
      ...(providerUid && { providerUid: providerUid }),
      ...(params.frequency && { frequency: params.frequency }),

      // In-memory filters (NOT in cache key)
      ...(params.start_date && { startDate: params.start_date }),
      ...(params.end_date && { endDate: params.end_date }),
      ...(params.advanced_filters && { advancedFilters: params.advanced_filters }),
    };

    // Fetch with caching (passing UserContext and request-scoped cache for deduplication)
    const fetchResult = await dataSourceCache.fetchDataSource(
      cacheParams,
      userContext,
      params.nocache || false,
      requestCache
    );

    // Calculate total count from filtered rows
    const totalCount = this.calculateTotal(fetchResult.rows as AggAppMeasure[]);

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
   * Execute multiple series query
   * Fetches each series separately (can hit cache per measure) and combines results
   */
  private async executeMultipleSeries(
    params: AnalyticsQueryParams,
    userContext: UserContext,
    requestCache?: RequestScopedCache
  ): Promise<AnalyticsQueryResult> {
    const startTime = Date.now();

    if (!params.multiple_series || params.multiple_series.length === 0) {
      throw new Error('Multiple series configuration is required');
    }

    log.info('Building multiple series query with caching', {
      seriesCount: params.multiple_series.length,
      measures: params.multiple_series.map((s) => s.measure),
      userId: userContext.user_id,
    });

    // Fetch each series separately (can hit cache per measure)
    const seriesPromises = params.multiple_series.map(async (series) => {
      const seriesParams: AnalyticsQueryParams = {
        ...params,
        measure: series.measure,
        multiple_series: undefined, // Clear to avoid recursion
      };

      // Recursive call - will hit cache per measure (with request-scoped cache for deduplication)
      const result = await this.queryMeasures(seriesParams, userContext, requestCache);

      // Tag with series metadata
      return result.data.map((item) => ({
        ...item,
        series_id: series.id,
        series_label: series.label,
        series_aggregation: series.aggregation,
        ...(series.color && { series_color: series.color }),
      }));
    });

    const allSeriesData = await Promise.all(seriesPromises);
    const combinedData = allSeriesData.flat();

    const duration = Date.now() - startTime;

    const result: AnalyticsQueryResult = {
      data: combinedData,
      total_count: combinedData.length,
      query_time_ms: duration,
      cache_hit: true, // Each series fetched from cache (potentially)
    };

    log.info('Multiple series query completed (with caching)', {
      seriesCount: params.multiple_series.length,
      totalRecords: combinedData.length,
      queryTime: duration,
      userId: userContext.user_id,
    });

    return result;
  }

  /**
   * Execute period comparison query
   * Executes current period + comparison period in parallel
   */
  private async executePeriodComparison(
    params: AnalyticsQueryParams,
    userContext: UserContext,
    requestCache?: RequestScopedCache
  ): Promise<AnalyticsQueryResult> {
    const startTime = Date.now();

    if (!params.period_comparison?.enabled) {
      throw new Error('Period comparison configuration is required');
    }

    if (!params.frequency || !params.start_date || !params.end_date) {
      throw new Error('Frequency, start_date, and end_date are required for period comparison');
    }

    // Validate period comparison configuration
    if (!params.period_comparison.comparisonType) {
      throw new Error('Comparison type is required for period comparison');
    }

    if (
      params.period_comparison.comparisonType === 'custom_period' &&
      (!params.period_comparison.customPeriodOffset ||
        params.period_comparison.customPeriodOffset < 1)
    ) {
      throw new Error('Custom period offset must be at least 1');
    }

    log.info('Building period comparison analytics query', {
      comparisonType: params.period_comparison.comparisonType,
      frequency: params.frequency,
      currentRange: { start: params.start_date, end: params.end_date },
      userId: userContext.user_id,
    });

    // Import period comparison utilities
    const { calculateComparisonDateRange, generateComparisonLabel } = await import(
      '@/lib/utils/period-comparison'
    );

    // Calculate comparison date range
    let comparisonRange: { start: string; end: string };
    try {
      comparisonRange = calculateComparisonDateRange(
        params.start_date,
        params.end_date,
        params.frequency,
        params.period_comparison
      );
    } catch (error) {
      log.error('Failed to calculate comparison date range', error, {
        comparisonType: params.period_comparison.comparisonType,
        frequency: params.frequency,
        startDate: params.start_date,
        endDate: params.end_date,
      });
      throw new Error(
        `Failed to calculate comparison date range: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // Create comparison query parameters (remove period_comparison to avoid recursion)
    const { period_comparison: _removed, ...baseParams } = params;

    const currentPeriodParams: AnalyticsQueryParams = {
      ...baseParams,
      start_date: params.start_date,
      end_date: params.end_date,
    };

    const comparisonPeriodParams: AnalyticsQueryParams = {
      ...baseParams,
      start_date: comparisonRange.start,
      end_date: comparisonRange.end,
    };

    log.info('Executing period comparison queries in parallel', {
      currentPeriod: { start: params.start_date, end: params.end_date },
      comparisonPeriod: comparisonRange,
      userId: userContext.user_id,
    });

    // Execute both queries in parallel (with request-scoped cache for deduplication)
    const [currentResult, comparisonResult] = await Promise.all([
      this.queryMeasures(currentPeriodParams, userContext, requestCache),
      this.queryMeasures(comparisonPeriodParams, userContext, requestCache),
    ]);

    // Generate comparison label
    const comparisonLabel = generateComparisonLabel(
      params.frequency,
      params.period_comparison
    );

    // Tag data with period labels
    const currentData = currentResult.data.map((item) => ({
      ...item,
      period_label: 'Current Period',
      period_type: 'current',
    }));

    const comparisonData = comparisonResult.data.map((item) => ({
      ...item,
      period_label: comparisonLabel,
      period_type: 'comparison',
    }));

    const combinedData = [...currentData, ...comparisonData];

    const duration = Date.now() - startTime;

    const result: AnalyticsQueryResult = {
      data: combinedData,
      total_count: combinedData.length,
      query_time_ms: duration,
      cache_hit: Boolean(currentResult.cache_hit && comparisonResult.cache_hit),
    };

    log.info('Period comparison query completed', {
      comparisonType: params.period_comparison.comparisonType,
      currentRecords: currentData.length,
      comparisonRecords: comparisonData.length,
      totalRecords: combinedData.length,
      queryTime: duration,
      userId: userContext.user_id,
    });

    return result;
  }

  /**
   * Main analytics query entry point
   * All queries now use the cache path with RBAC filtering in-memory
   *
   * ROUTING LOGIC:
   * 1. Multiple series? → Execute each series in parallel (hits cache per measure)
   * 2. Period comparison? → Execute current + comparison period in parallel
   * 3. Standard query? → Cache path with optional nocache flag
   *
   * @param params - Query parameters (data_source_id REQUIRED)
   * @param userContext - User context for RBAC
   * @param requestCache - Optional request-scoped cache for deduplication
   * @returns Query result with data and metadata
   */
  async queryMeasures(
    params: AnalyticsQueryParams,
    userContext: UserContext,
    requestCache?: RequestScopedCache
  ): Promise<AnalyticsQueryResult> {
    const startTime = Date.now();

    try {
      // SECURITY: data_source_id is required (all charts have it)
      if (!params.data_source_id) {
        throw new Error('data_source_id is required - all charts must have a data source');
      }

      // If multiple series are requested, handle them separately
      if (params.multiple_series && params.multiple_series.length > 0) {
        return await this.executeMultipleSeries(params, userContext, requestCache);
      }

      // If period comparison is requested, handle it separately
      if (params.period_comparison?.enabled) {
        return await this.executePeriodComparison(params, userContext, requestCache);
      }

      log.info('Building analytics query with caching', {
        params: { ...params, limit: params.limit || 1000 },
        userId: userContext.user_id,
      });

      // Get data source configuration
      const dataSourceConfig = await chartConfigService.getDataSourceConfigById(
        params.data_source_id
      );

      if (!dataSourceConfig) {
        throw new Error(`Data source not found: ${params.data_source_id}`);
      }

      const tableName = dataSourceConfig.tableName;
      const schemaName = dataSourceConfig.schemaName;

      // Validate table access
      await queryValidator.validateTable(tableName, schemaName, dataSourceConfig);

      // Always use cache path (with nocache support for previews)
      return await this.executeCachePath(params, userContext, tableName, schemaName, startTime, requestCache);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error('Analytics query failed', error, {
        params,
        userId: userContext.user_id,
      });

      throw new Error(`Query execution failed: ${errorMessage}`);
    }
  }
}

// Export singleton instance
export const queryOrchestrator = new QueryOrchestrator();
