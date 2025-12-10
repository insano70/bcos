import type { NextRequest } from 'next/server';
import { createErrorResponse, handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log } from '@/lib/logger';
import { analyticsQueryBuilder } from '@/lib/services/analytics';
import { checkAnalyticsDbHealth } from '@/lib/services/analytics-db';
import { columnMappingService } from '@/lib/services/column-mapping-service';
import type {
  AggAppMeasure,
  AnalyticsQueryParams,
  ChartFilter,
  FrequencyType,
  MeasureType,
  MultipleSeriesConfig,
  PeriodComparisonConfig,
} from '@/lib/types/analytics';
import { MeasureAccessor } from '@/lib/services/analytics/measure-accessor';
import type { UserContext } from '@/lib/types/rbac';
import { getDateRange } from '@/lib/utils/date-presets';

/**
 * Admin Analytics - Measures Data
 * Provides comprehensive measures analytics from ih.gr_app_measures table
 */
const analyticsHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();
  let queryParams: AnalyticsQueryParams | undefined;

  log.info('Measures analytics request initiated', {
    requestingUserId: userContext.user_id,
    isSuperAdmin: userContext.is_super_admin,
  });

  try {
    // Health check for analytics database
    const healthStart = Date.now();
    const healthCheck = await checkAnalyticsDbHealth();
    log.info('Analytics DB health check completed', { duration: Date.now() - healthStart });

    if (!healthCheck.isHealthy) {
      log.error(
        'Analytics database health check failed',
        new Error(healthCheck.error || 'Unknown error')
      );

      // Provide helpful error message for configuration issues
      if (healthCheck.error?.includes('not configured')) {
        return createErrorResponse(
          'Analytics database not configured. Please set ANALYTICS_DATABASE_URL in your environment.',
          503
        );
      }

      return createErrorResponse('Analytics database unavailable', 503);
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);

    const practiceUidParam = searchParams.get('practice_uid');
    // Parse advanced filters from query parameters
    const advancedFiltersParam = searchParams.get('advanced_filters');
    let advancedFilters: ChartFilter[] | undefined;
    if (advancedFiltersParam) {
      try {
        advancedFilters = JSON.parse(decodeURIComponent(advancedFiltersParam)) as ChartFilter[];
      } catch (_error) {
        return createErrorResponse('Invalid advanced_filters parameter format', 400);
      }
    }

    // Parse calculated field parameter
    const calculatedField = searchParams.get('calculated_field') || undefined;

    // Parse multiple series configuration
    const multipleSeriesParam = searchParams.get('multiple_series');
    let multipleSeries: MultipleSeriesConfig[] | undefined;
    if (multipleSeriesParam) {
      try {
        multipleSeries = JSON.parse(
          decodeURIComponent(multipleSeriesParam)
        ) as MultipleSeriesConfig[];
      } catch (_error) {
        return createErrorResponse('Invalid multiple_series parameter format', 400);
      }
    }

    // Parse period comparison configuration
    let periodComparison: PeriodComparisonConfig | undefined;
    const periodComparisonParam = searchParams.get('period_comparison');
    if (periodComparisonParam) {
      try {
        periodComparison = JSON.parse(
          decodeURIComponent(periodComparisonParam)
        ) as PeriodComparisonConfig;
      } catch (_error) {
        return createErrorResponse('Invalid period_comparison parameter format', 400);
      }
    }

    const dataSourceIdParam = searchParams.get('data_source_id');
    const chartType = searchParams.get('chart_type') || undefined;

    // Handle dynamic date range calculation from presets
    const dateRangePreset = searchParams.get('date_range_preset') || undefined;
    const providedStartDate = searchParams.get('start_date') || undefined;
    const providedEndDate = searchParams.get('end_date') || undefined;

    // Calculate dates: prefer preset calculation over provided dates
    const { startDate, endDate } = getDateRange(
      dateRangePreset,
      providedStartDate,
      providedEndDate
    );

    const queryParams: AnalyticsQueryParams = {
      measure: (searchParams.get('measure') as MeasureType) || undefined,
      frequency: (searchParams.get('frequency') as FrequencyType) || undefined,
      practice: searchParams.get('practice') || undefined,
      practice_primary: searchParams.get('practice_primary') || undefined,
      practice_uid: practiceUidParam ? parseInt(practiceUidParam, 10) : undefined,
      provider_name: searchParams.get('provider_name') || undefined,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit') || '', 10) : undefined,
      offset: searchParams.get('offset')
        ? parseInt(searchParams.get('offset') || '', 10)
        : undefined,
      advanced_filters: advancedFilters,
      calculated_field: calculatedField,
      multiple_series: multipleSeries,
      data_source_id: dataSourceIdParam ? parseInt(dataSourceIdParam, 10) : undefined,
      period_comparison: periodComparison,
    };

    log.debug('Parsed query params', {
      queryParams,
      rawPracticeUid: practiceUidParam,
      parsedPracticeUid: queryParams.practice_uid,
    });

    // Validate query parameters
    if (queryParams.limit && (queryParams.limit < 1 || queryParams.limit > 10000)) {
      return createErrorResponse('Invalid limit parameter', 400);
    }

    if (queryParams.offset && queryParams.offset < 0) {
      return createErrorResponse('Invalid offset parameter', 400);
    }

    // Validate date parameters
    if (queryParams.start_date && !isValidDate(queryParams.start_date)) {
      return createErrorResponse('Invalid start_date format', 400);
    }

    if (queryParams.end_date && !isValidDate(queryParams.end_date)) {
      return createErrorResponse('Invalid end_date format', 400);
    }

    log.info('Analytics query parameters parsed', queryParams as Record<string, unknown>);

    // Pass userContext directly to enable cache integration
    // SECURITY: queryMeasures() will build ChartRenderContext internally with proper RBAC
    // Passing UserContext (not ChartRenderContext) enables the Redis cache path
    const queryStart = Date.now();
    const result = await analyticsQueryBuilder.queryMeasures(queryParams, userContext);
    log.info('Analytics query execution completed', { duration: Date.now() - queryStart });

    // Log successful operation
    log.db('SELECT', 'ih.gr_app_measures', Date.now() - startTime, {
      rowCount: result.data.length,
    });

    log.info('Analytics measures request completed successfully', {
      resultCount: result.data.length,
      totalCount: result.total_count,
      queryTimeMs: result.query_time_ms,
      totalRequestTime: Date.now() - startTime,
    });

    // For 'number' chart type, aggregate to a single total value
    let measuresData = result.data;
    if (chartType === 'number' && result.data.length > 0) {
      // Use MeasureAccessor for dynamic column access
      let total = 0;

      if (queryParams.data_source_id && result.data.length > 0) {
        try {
          const mapping = await columnMappingService.getMapping(queryParams.data_source_id);

          // Sum all measure values using accessor
          // Record<string, unknown> from database matches AggAppMeasure dynamic schema
          total = result.data.reduce((sum, measure) => {
            const accessor = new MeasureAccessor(measure as AggAppMeasure, mapping);
            return sum + accessor.getMeasureValue();
          }, 0);
        } catch (error) {
          log.warn('Failed to use MeasureAccessor for aggregation, using default', { error });
          // Fallback to default behavior
          total = result.data.reduce((sum, measure) => {
            const value =
              typeof measure.measure_value === 'string'
                ? parseFloat(measure.measure_value as string)
                : (measure.measure_value as number) || 0;
            return sum + (Number.isNaN(value) ? 0 : value);
          }, 0);
        }
      } else {
        // No data source ID, use default behavior
        total = result.data.reduce((sum, measure) => {
          const value =
            typeof measure.measure_value === 'string'
              ? parseFloat(measure.measure_value as string)
              : (measure.measure_value as number) || 0;
          return sum + (Number.isNaN(value) ? 0 : value);
        }, 0);
      }

      // Determine measure type using accessor if available
      let measureType = 'number';
      if (queryParams.data_source_id && result.data[0]) {
        try {
          const mapping = await columnMappingService.getMapping(queryParams.data_source_id);
          // Record<string, unknown> from database matches AggAppMeasure dynamic schema
          const accessor = new MeasureAccessor(result.data[0] as AggAppMeasure, mapping);
          measureType = accessor.getMeasureType();
        } catch {
          measureType = (result.data[0]?.measure_type as string) || 'number';
        }
      } else {
        measureType = (result.data[0]?.measure_type as string) || 'number';
      }

      // Return a single measure with the aggregated total
      measuresData = [
        {
          measure_value: total,
          measure_type: measureType,
          date_index: new Date().toISOString().split('T')[0] || '',
          measure: queryParams.measure || 'Total',
          aggregation_type: 'sum',
        },
      ];

      log.info('Number chart aggregation completed', {
        originalCount: result.data.length,
        total,
        sampleValues: result.data.slice(0, 3).map((m) => ({
          value: m.measure_value,
          type: typeof m.measure_value,
        })),
      });
    }

    const analytics = {
      measures: measuresData,
      pagination: {
        total_count: result.total_count,
        limit: queryParams.limit || 1000,
        offset: queryParams.offset || 0,
        has_more: (queryParams.offset || 0) + result.data.length < result.total_count,
      },
      metadata: {
        query_time_ms: result.query_time_ms,
        cache_hit: result.cache_hit || false,
        analytics_db_latency_ms: healthCheck.latency,
        generatedAt: new Date().toISOString(),
      },
    };

    return createSuccessResponse(analytics, 'Measures analytics retrieved successfully');
  } catch (error) {
    log.error('Measures analytics error', error, {
      queryParams,
      requestingUserId: userContext.user_id,
    });

    log.info('Analytics request failed', { duration: Date.now() - startTime });
    return handleRouteError(error, 'Failed to process analytics measures request', request);
  } finally {
    log.info('Measures analytics total', { duration: Date.now() - startTime });
  }
};

/**
 * Validate date string format (YYYY-MM-DD)
 */
function isValidDate(dateString: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;

  const date = new Date(dateString);
  return date instanceof Date && !Number.isNaN(date.getTime());
}

/**
 * GET /api/analytics/measures
 * Fetch measures data with filtering and pagination
 *
 * Query Parameters:
 * - measure: Filter by measure type (e.g., "Charges by Practice")
 * - frequency: Filter by frequency (Monthly, Weekly, Quarterly)
 * - practice_uid: Filter by specific practice
 * - provider_uid: Filter by specific provider
 * - start_date: Filter by period start date (YYYY-MM-DD)
 * - end_date: Filter by period end date (YYYY-MM-DD)
 * - limit: Number of records to return (1-10000, default 1000)
 * - offset: Number of records to skip (default 0)
 */
// Uses analytics:read:all permission (granted via roles)
// Super admins bypass permission checks automatically
export const GET = rbacRoute(analyticsHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api',
});

/**
 * Health check endpoint for analytics measures
 */
export async function HEAD(_request: NextRequest) {
  try {
    const health = await checkAnalyticsDbHealth();

    if (health.isHealthy) {
      return new Response(null, {
        status: 200,
        headers: {
          'X-Analytics-DB-Latency': health.latency?.toString() || '0',
        },
      });
    } else {
      return new Response(null, { status: 503 });
    }
  } catch (_error) {
    return new Response(null, { status: 503 });
  }
}
