import { QUERY_LIMITS } from '@/lib/constants/analytics';
import { log } from '@/lib/logger';
import type { RequestScopedCache } from '@/lib/cache/request-scoped-cache';
import type {
  AnalyticsQueryParams,
  ChartData,
  ChartFilter,
} from '@/lib/types/analytics';
import type { UserContext } from '@/lib/types/rbac';
import { getDateRange } from '@/lib/utils/date-presets';
import { analyticsQueryBuilder } from '../analytics';
import type { ChartTypeHandler, ValidationResult } from '../chart-type-registry';
import type { UniversalChartFilters } from '@/lib/types/filters';

/**
 * Base Chart Handler
 *
 * Abstract base class for all chart type handlers.
 * Provides common functionality and enforces consistent interface.
 *
 * Benefits:
 * - Shared validation logic
 * - Common error handling
 * - RBAC filter application
 * - Consistent logging
 * - Reduces code duplication
 */
export abstract class BaseChartHandler implements ChartTypeHandler {
  /**
   * Chart type identifier (must be unique)
   */
  abstract type: string;

  /**
   * Check if this handler can handle the given configuration
   * Default implementation checks chartType field
   */
  canHandle(config: Record<string, unknown>): boolean {
    return config.chartType === this.type;
  }

  /**
   * Fetch raw data for this chart type
   * Subclasses can override for custom fetching logic
   *
   * @param config - Chart configuration
   * @param userContext - User context for RBAC
   * @param requestCache - Optional request-scoped cache for deduplication
   */
  async fetchData(
    config: Record<string, unknown>,
    userContext: UserContext,
    requestCache?: RequestScopedCache
  ): Promise<{
    data: Record<string, unknown>[];
    cacheHit: boolean;
    queryTimeMs: number;
  }> {
    const startTime = Date.now();

    try {
      // Build analytics query parameters from config
      const queryParams = this.buildQueryParams(config);

      log.info('Fetching chart data with Redis cache integration', {
        chartType: this.type,
        dataSourceId: config.dataSourceId,
        userId: userContext.user_id,
        hasDataSourceId: Boolean(config.dataSourceId),
        hasRequestCache: Boolean(requestCache),
        note: 'Passing UserContext to enable Redis cache path',
      });

      // Pass userContext directly to enable Redis cache integration
      // SECURITY: queryMeasures() will build ChartRenderContext internally with proper RBAC
      // Passing UserContext (not ChartRenderContext) enables the Redis cache path
      const result = await analyticsQueryBuilder.queryMeasures(queryParams, userContext, requestCache);

      const duration = Date.now() - startTime;

      log.info('Chart data fetched successfully', {
        chartType: this.type,
        recordCount: result.data.length,
        queryTimeMs: result.query_time_ms,
        cacheHit: result.cache_hit || false,
        fetchDuration: duration,
        userId: userContext.user_id,
      });

      return {
        data: result.data as Record<string, unknown>[],
        cacheHit: result.cache_hit || false,
        queryTimeMs: result.query_time_ms,
      };
    } catch (error) {
      log.error('Failed to fetch chart data', error, {
        chartType: this.type,
        userId: userContext.user_id,
      });

      throw error;
    }
  }

  /**
   * Transform raw data into Chart.js format
   * Subclasses MUST implement this method
   * May be async for handlers that need to load data source configuration
   */
  abstract transform(
    data: Record<string, unknown>[],
    config: Record<string, unknown>
  ): ChartData | Promise<ChartData>;

  /**
   * Validate chart configuration
   * Subclasses can override for custom validation
   */
  validate(config: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];

    // Common validations
    if (!config.chartType) {
      errors.push('chartType is required');
    }

    if (!config.dataSourceId) {
      errors.push('dataSourceId is required');
    }

    if (typeof config.dataSourceId === 'number' && config.dataSourceId <= 0) {
      errors.push('dataSourceId must be a positive number');
    }

    // Allow subclasses to add custom validations
    const customErrors = this.validateCustom(config);
    errors.push(...customErrors);

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Custom validation hook for subclasses
   * Override to add chart-type-specific validations
   */
  protected validateCustom(_config: Record<string, unknown>): string[] {
    // Default: no custom validations
    return [];
  }

  /**
   * Get data source type for this chart handler
   * Override in subclasses to specify type explicitly (e.g., table-based)
   * If not overridden, type will be auto-detected from database
   */
  protected getDataSourceType(): 'measure-based' | 'table-based' | undefined {
    // Default: undefined (will be auto-detected)
    return undefined;
  }

  /**
   * Build analytics query parameters from chart config
   * 
   * Converts chart configuration to AnalyticsQueryParams for query execution.
   * Handles date range resolution, filter extraction, and special chart types
   * (multipleSeries, periodComparison, calculatedField).
   * 
   * Note: Config is already normalized by ChartConfigBuilderService, so dates
   * and organizations are already resolved. This method just builds query params.
   */
  protected buildQueryParams(config: Record<string, unknown>): AnalyticsQueryParams {
    // Build universal filters from config
    const universalFilters: UniversalChartFilters = {};
    
    if (typeof config.startDate === 'string') universalFilters.startDate = config.startDate;
    if (typeof config.endDate === 'string') universalFilters.endDate = config.endDate;
    if (typeof config.dateRangePreset === 'string') universalFilters.dateRangePreset = config.dateRangePreset;
    if (typeof config.measure === 'string') universalFilters.measure = config.measure;
    if (typeof config.frequency === 'string') universalFilters.frequency = config.frequency;
    if (typeof config.providerName === 'string') universalFilters.providerName = config.providerName;
    if (Array.isArray(config.practiceUids)) universalFilters.practiceUids = config.practiceUids as number[];
    if (Array.isArray(config.advancedFilters)) universalFilters.advancedFilters = config.advancedFilters as ChartFilter[];

    // Calculate date range
    const { startDate, endDate } = getDateRange(
      universalFilters.dateRangePreset,
      universalFilters.startDate,
      universalFilters.endDate
    );

    const queryParams: AnalyticsQueryParams = {
      data_source_id: config.dataSourceId as number,
      start_date: startDate,
      end_date: endDate,
      limit: (config.limit as number) || QUERY_LIMITS.DEFAULT_ANALYTICS_LIMIT,
    };

    // Data source type
    const dataSourceType = this.getDataSourceType();
    if (dataSourceType) {
      queryParams.data_source_type = dataSourceType;
    }

    // Optional parameters
    if (universalFilters.measure) {
      queryParams.measure = universalFilters.measure as import('@/lib/types/analytics').MeasureType;
    }
    if (universalFilters.frequency) {
      queryParams.frequency = universalFilters.frequency as import('@/lib/types/analytics').FrequencyType;
    }
    if (config.practice) {
      queryParams.practice = config.practice as string;
    }
    if (config.practiceUid) {
      const practiceUid = typeof config.practiceUid === 'string' ? parseInt(config.practiceUid, 10) : (config.practiceUid as number);
      if (!Number.isNaN(practiceUid)) {
        queryParams.practice_uid = practiceUid;
      }
    }
    if (universalFilters.providerName) {
      queryParams.provider_name = universalFilters.providerName;
    }

    // Handle practiceUids with fail-closed security
    if (universalFilters.practiceUids && Array.isArray(universalFilters.practiceUids)) {
      if (universalFilters.practiceUids.length === 0) {
        // FAIL-CLOSED SECURITY: Empty array = no data
        const practiceUidFilter: ChartFilter = {
          field: 'practice_uid',
          operator: 'in',
          value: [-1],
        };
        queryParams.advanced_filters = [practiceUidFilter, ...(universalFilters.advancedFilters || [])];
        
        log.security('fail-closed security triggered - empty practiceUids', 'high', {
          operation: 'build_query_params',
          component: 'chart-handler',
          failedClosed: true,
        });
      } else {
        // Normal case
        const practiceUidFilter: ChartFilter = {
          field: 'practice_uid',
          operator: 'in',
          value: universalFilters.practiceUids,
        };
        queryParams.advanced_filters = [practiceUidFilter, ...(universalFilters.advancedFilters || [])];
        
        log.info('dashboard organization filter applied', {
          practiceUidCount: universalFilters.practiceUids.length,
          component: 'chart-handler',
        });
      }
    } else if (universalFilters.advancedFilters) {
      queryParams.advanced_filters = universalFilters.advancedFilters;
    }

    // Special chart type support
    if (config.calculatedField) {
      queryParams.calculated_field = config.calculatedField as string;
    }
    if (config.multipleSeries) {
      queryParams.multiple_series = config.multipleSeries as import('@/lib/types/analytics').MultipleSeriesConfig[];
    }
    if (config.periodComparison) {
      queryParams.period_comparison = config.periodComparison as import('@/lib/types/analytics').PeriodComparisonConfig;
    }

    return queryParams;
  }


  /**
   * Get color palette for chart
   * Helper method for transform
   */
  protected getColorPalette(config: Record<string, unknown>): string {
    return (config.colorPalette as string) || 'default';
  }

  /**
   * Get groupBy field from config
   * Helper method for transform
   */
  protected getGroupBy(config: Record<string, unknown>): string {
    return (config.groupBy as string) || 'none';
  }
}
