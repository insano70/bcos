import type { UserContext } from '@/lib/types/rbac';
import type { ChartData, ChartRenderContext, AnalyticsQueryParams } from '@/lib/types/analytics';
import type { ChartTypeHandler, ValidationResult } from '../chart-type-registry';
import { log } from '@/lib/logger';
import { analyticsQueryBuilder } from '../analytics-query-builder';
import { getDateRange } from '@/lib/utils/date-presets';
import { QUERY_LIMITS } from '@/lib/constants/analytics';

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
   */
  async fetchData(
    config: Record<string, unknown>,
    userContext: UserContext
  ): Promise<Record<string, unknown>[]> {
    const startTime = Date.now();

    try {
      // Build analytics query parameters from config
      const queryParams = this.buildQueryParams(config);

      // Build chart render context with RBAC
      const chartContext = this.buildChartContext(userContext);

      log.info('Fetching chart data', {
        chartType: this.type,
        dataSourceId: config.dataSourceId,
        userId: userContext.user_id,
      });

      // Execute query via analytics query builder
      const result = await analyticsQueryBuilder.queryMeasures(queryParams, chartContext);

      const duration = Date.now() - startTime;

      log.info('Chart data fetched successfully', {
        chartType: this.type,
        recordCount: result.data.length,
        queryTimeMs: result.query_time_ms,
        fetchDuration: duration,
      });

      return result.data as Record<string, unknown>[];
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
   */
  abstract transform(data: Record<string, unknown>[], config: Record<string, unknown>): ChartData;

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
   * Build analytics query parameters from chart config
   * Helper method for fetchData
   */
  protected buildQueryParams(config: Record<string, unknown>): AnalyticsQueryParams {
    // Calculate date range from preset or explicit dates
    const { startDate, endDate } = getDateRange(
      config.dateRangePreset as string | undefined,
      config.startDate as string | undefined,
      config.endDate as string | undefined
    );

    // Build query parameters
    const queryParams: AnalyticsQueryParams = {
      data_source_id: config.dataSourceId as number,
      start_date: startDate,
      end_date: endDate,
      limit: (config.limit as number) || QUERY_LIMITS.DEFAULT_ANALYTICS_LIMIT,
    };

    // Add optional parameters if present
    if (config.measure) {
      queryParams.measure = config.measure as import('@/lib/types/analytics').MeasureType;
    }

    if (config.frequency) {
      queryParams.frequency = config.frequency as import('@/lib/types/analytics').FrequencyType;
    }

    if (config.practice) {
      queryParams.practice = config.practice as string;
    }

    if (config.practiceUid) {
      const practiceUid = typeof config.practiceUid === 'string'
        ? parseInt(config.practiceUid, 10)
        : (config.practiceUid as number);
      if (!Number.isNaN(practiceUid)) {
        queryParams.practice_uid = practiceUid;
      }
    }

    if (config.providerName) {
      queryParams.provider_name = config.providerName as string;
    }

    if (config.advancedFilters) {
      queryParams.advanced_filters = config.advancedFilters as import('@/lib/types/analytics').ChartFilter[];
    }

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
   * Build chart render context from user context
   * Helper method for fetchData
   */
  protected buildChartContext(userContext: UserContext): ChartRenderContext {
    return {
      user_id: userContext.user_id,
      accessible_practices: [], // Empty = all accessible (filtered by route-level RBAC)
      accessible_providers: [], // Empty = all accessible (filtered by route-level RBAC)
      roles: userContext.roles?.map((role) => role.name) || [],
    };
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
