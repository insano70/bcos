import { QUERY_LIMITS } from '@/lib/constants/analytics';
import { log } from '@/lib/logger';
import type {
  AnalyticsQueryParams,
  ChartData,
  ChartFilter,
  ChartRenderContext,
} from '@/lib/types/analytics';
import type { UserContext } from '@/lib/types/rbac';
import { getDateRange } from '@/lib/utils/date-presets';
import { analyticsQueryBuilder } from '../analytics';
import type { ChartTypeHandler, ValidationResult } from '../chart-type-registry';
import { createOrganizationAccessService } from '../organization-access-service';

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
        note: 'Passing UserContext to enable Redis cache path',
      });

      // Pass userContext directly to enable Redis cache integration
      // SECURITY: queryMeasures() will build ChartRenderContext internally with proper RBAC
      // Passing UserContext (not ChartRenderContext) enables the Redis cache path
      const result = await analyticsQueryBuilder.queryMeasures(queryParams, userContext);

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
   * Helper method for fetchData
   * Subclasses can override getDataSourceType() to specify type explicitly
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

    // Allow subclasses to specify data source type explicitly
    const dataSourceType = this.getDataSourceType();
    if (dataSourceType) {
      queryParams.data_source_type = dataSourceType;
    }

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
      const practiceUid =
        typeof config.practiceUid === 'string'
          ? parseInt(config.practiceUid, 10)
          : (config.practiceUid as number);
      if (!Number.isNaN(practiceUid)) {
        queryParams.practice_uid = practiceUid;
      }
    }

    // Handle dashboard universal filter: practiceUids array from organization selection
    // SECURITY-CRITICAL: Empty array = organization has no practices = FAIL CLOSED (return no data)
    if (config.practiceUids && Array.isArray(config.practiceUids)) {
      if (config.practiceUids.length === 0) {
        // FAIL-CLOSED SECURITY: Empty array means organization has no practices
        // Use impossible value to ensure query returns no results
        const practiceUidFilter: ChartFilter = {
          field: 'practice_uid',
          operator: 'in',
          value: [-1], // Impossible practice_uid value - number[] is now valid ChartFilterValue
        };

        if (!queryParams.advanced_filters) {
          queryParams.advanced_filters = [];
        }
        queryParams.advanced_filters.push(practiceUidFilter);

        log.security(
          'dashboard organization filter applied - empty organization (fail-closed)',
          'high',
          {
            operation: 'build_query_params',
            practiceUidCount: 0,
            result: 'no_data_returned',
            reason: 'organization_has_no_practices',
            source: 'dashboard_universal_filter',
            component: 'chart-handler',
            failedClosed: true,
          }
        );
      } else {
        // Normal case: organization has practices
        const practiceUidFilter: ChartFilter = {
          field: 'practice_uid',
          operator: 'in',
          value: config.practiceUids, // number[] is now valid ChartFilterValue
        };

        if (!queryParams.advanced_filters) {
          queryParams.advanced_filters = [];
        }
        queryParams.advanced_filters.push(practiceUidFilter);

        log.info('dashboard organization filter applied', {
          operation: 'build_query_params',
          practiceUidCount: (config.practiceUids as number[]).length,
          practiceUids: config.practiceUids,
          source: 'dashboard_universal_filter',
          component: 'chart-handler',
        });
      }
    }

    if (config.providerName) {
      queryParams.provider_name = config.providerName as string;
    }

    // Merge chart-specific advanced filters with any filters we've already added
    if (config.advancedFilters) {
      const chartFilters = config.advancedFilters as import('@/lib/types/analytics').ChartFilter[];
      if (queryParams.advanced_filters) {
        // Merge with existing filters (e.g., practiceUids filter added above)
        queryParams.advanced_filters = [...queryParams.advanced_filters, ...chartFilters];
      } else {
        queryParams.advanced_filters = chartFilters;
      }
    }

    if (config.calculatedField) {
      queryParams.calculated_field = config.calculatedField as string;
    }

    if (config.multipleSeries) {
      queryParams.multiple_series =
        config.multipleSeries as import('@/lib/types/analytics').MultipleSeriesConfig[];
    }

    if (config.periodComparison) {
      queryParams.period_comparison =
        config.periodComparison as import('@/lib/types/analytics').PeriodComparisonConfig;
    }

    return queryParams;
  }

  /**
   * Build chart render context from user context
   *
   * SECURITY-CRITICAL: This method populates security filters based on user permissions
   *
   * Permission Model:
   * - analytics:read:all → No filtering (super admin sees all data)
   * - analytics:read:organization → Filter by org's practice_uids (+ hierarchy)
   * - analytics:read:own → Filter by user's provider_uid
   * - No permission → Fail-closed (no data)
   *
   * UPDATED: Now async to integrate with OrganizationAccessService
   * All chart handlers must await this method
   */
  protected async buildChartContext(userContext: UserContext): Promise<ChartRenderContext> {
    const startTime = Date.now();

    // Create access service for permission resolution
    const accessService = createOrganizationAccessService(userContext);

    // Get organization-based practice_uid filtering
    const practiceAccess = await accessService.getAccessiblePracticeUids();

    // Get provider-based provider_uid filtering
    const providerAccess = await accessService.getAccessibleProviderUid();

    const duration = Date.now() - startTime;

    log.debug('Chart security context built', {
      userId: userContext.user_id,
      permissionScope: practiceAccess.scope,
      practiceUidCount: practiceAccess.practiceUids.length,
      providerUid: providerAccess.providerUid,
      includesHierarchy: practiceAccess.includesHierarchy,
      organizationCount: practiceAccess.organizationIds.length,
      duration,
    });

    return {
      user_id: userContext.user_id,

      // UPDATED: Actual practice_uid filtering based on organizations + hierarchy
      accessible_practices: practiceAccess.practiceUids,

      // UPDATED: Actual provider_uid filtering for analytics:read:own
      accessible_providers: providerAccess.providerUid ? [providerAccess.providerUid] : [],

      roles: userContext.roles?.map((role) => role.name) || [],

      // NEW: Metadata for logging and security audit
      permission_scope: practiceAccess.scope,
      organization_ids: practiceAccess.organizationIds,
      includes_hierarchy: practiceAccess.includesHierarchy,
      provider_uid: providerAccess.providerUid,
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
