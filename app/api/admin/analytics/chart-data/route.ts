import type { NextRequest } from 'next/server';

import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { validateRequest } from '@/lib/api/middleware/validation';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import type { UserContext } from '@/lib/types/rbac';
import type { ChartData, AnalyticsQueryParams } from '@/lib/types/analytics';
import { chartDataRequestSchema } from '@/lib/validations/analytics';
import { SimplifiedChartTransformer } from '@/lib/utils/simplified-chart-transformer';
import { loadColumnMetadata } from '@/lib/utils/chart-metadata-loader.server';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import { analyticsQueryBuilder } from '@/lib/services/analytics';
import { calculatedFieldsService } from '@/lib/services/calculated-fields';
import { getDateRange } from '@/lib/utils/date-presets';

/**
 * Transform Chart Data Handler
 * POST /api/admin/analytics/chart-data
 *
 * Fetches, transforms, and returns chart-ready data in a single API call.
 * This optimized approach reduces network overhead, improves performance,
 * and minimizes data transfer between client and server.
 *
 * @param request - Next.js request object
 * @param userContext - Authenticated user context
 * @returns Transformed chart data in Chart.js format
 */
const transformChartDataHandler = async (
  request: NextRequest,
  userContext: UserContext
) => {
  const startTime = Date.now();

  try {
    // 1. Validate request body
    const validatedData = await validateRequest(request, chartDataRequestSchema);

    // 2. Fetch measures from analytics database
    const { startDate, endDate } = getDateRange(
      validatedData.dateRangePreset,
      validatedData.startDate,
      validatedData.endDate
    );

    // Build query parameters for analytics query builder
    const queryParams: AnalyticsQueryParams = {
      ...(validatedData.measure && { measure: validatedData.measure as import('@/lib/types/analytics').MeasureType }),
      ...(validatedData.frequency && { frequency: validatedData.frequency as import('@/lib/types/analytics').FrequencyType }),
      ...(validatedData.practice && { practice: validatedData.practice }),
      ...(validatedData.practiceUid && { practice_uid: parseInt(validatedData.practiceUid, 10) }),
      ...(validatedData.providerName && { provider_name: validatedData.providerName }),
      ...(startDate && { start_date: startDate }),
      ...(endDate && { end_date: endDate }),
      ...(validatedData.advancedFilters && { advanced_filters: validatedData.advancedFilters as import('@/lib/types/analytics').ChartFilter[] }),
      ...(validatedData.calculatedField && { calculated_field: validatedData.calculatedField }),
      ...(validatedData.dataSourceId && { data_source_id: validatedData.dataSourceId }),
      limit: 1000,
      ...(validatedData.multipleSeries && { multiple_series: validatedData.multipleSeries as import('@/lib/types/analytics').MultipleSeriesConfig[] }),
      ...(validatedData.periodComparison && { period_comparison: validatedData.periodComparison as import('@/lib/types/analytics').PeriodComparisonConfig }),
    };

    // Pass userContext directly to enable cache integration
    // SECURITY: queryMeasures() will build ChartRenderContext internally with proper RBAC
    // Passing UserContext (not ChartRenderContext) enables the Redis cache path
    const result = await analyticsQueryBuilder.queryMeasures(queryParams, userContext);
    let measures = result.data;

    // 3. Apply calculated fields if specified
    if (validatedData.calculatedField && measures.length > 0) {
      measures = calculatedFieldsService.applyCalculatedField(validatedData.calculatedField, measures);
    }

    // 4. Load column metadata (server-side only)
    const metadata = validatedData.dataSourceId
      ? await loadColumnMetadata(validatedData.dataSourceId)
      : undefined;

    // 5. Create transformer with metadata
    const transformer = new SimplifiedChartTransformer(metadata);

    // 6. Transform data based on chart type and features

    // Map stacked-bar to bar for transformation (stacking is handled by Chart.js config)
    // Filter out chart types not supported by transformer
    let transformChartType: 'line' | 'bar' | 'horizontal-bar' | 'progress-bar' | 'pie' | 'doughnut' | 'area' | 'table';

    if (validatedData.chartType === 'stacked-bar') {
      transformChartType = 'bar';
    } else if (validatedData.chartType === 'dual-axis' || validatedData.chartType === 'number') {
      // These types should not use this endpoint, but provide fallback
      transformChartType = 'bar';
    } else {
      transformChartType = validatedData.chartType;
    }

    let chartData: ChartData;

    // Handle multiple series charts
    if (validatedData.multipleSeries && validatedData.multipleSeries.length > 0) {
      const aggregations: Record<string, 'sum' | 'avg' | 'count' | 'min' | 'max'> = {};
      validatedData.multipleSeries.forEach(series => {
        if (series.label) {
          aggregations[series.label] = series.aggregation;
        }
      });

      chartData = transformer.createEnhancedMultiSeriesChart(
        measures,
        'measure',
        aggregations,
        validatedData.colorPalette
      );
    }
    // Handle period comparison charts
    else if (measures.some(m => m.series_id === 'current' || m.series_id === 'comparison')) {
      chartData = transformer.transformDataWithPeriodComparison(
        measures,
        transformChartType,
        validatedData.groupBy,
        validatedData.colorPalette
      );
    }
    // Standard single-series transformation
    else {
      chartData = transformer.transformData(
        measures,
        transformChartType,
        validatedData.groupBy,
        validatedData.colorPalette
      );
    }

    const duration = Date.now() - startTime;

    // Single comprehensive log with all important context
    log.info('Chart data transformation completed', {
      operation: 'transform_chart_data',
      userId: userContext.user_id,
      organizationId: userContext.current_organization_id,

      // Request details
      chartType: validatedData.chartType,
      measure: validatedData.measure,
      frequency: queryParams.frequency,
      hasFilters: Boolean(validatedData.advancedFilters?.length),
      hasMultipleSeries: Boolean(validatedData.multipleSeries),
      hasPeriodComparison: Boolean(validatedData.periodComparison),
      hasCalculatedField: Boolean(validatedData.calculatedField),
      hasDataSource: Boolean(validatedData.dataSourceId),

      // Results
      measureCount: measures.length,
      datasetCount: chartData.datasets?.length ?? 0,
      labelCount: chartData.labels?.length ?? 0,
      columnMetadataLoaded: Boolean(metadata),

      // Performance
      duration,
      queryTimeMs: result.query_time_ms,
      slow: duration > SLOW_THRESHOLDS.API_OPERATION,

      component: 'analytics',
    });

    // 7. Return transformed data with metadata and caching headers
    const response = createSuccessResponse({
      chartData,
      rawData: measures, // Include raw data for export functionality
      metadata: {
        transformedAt: new Date().toISOString(),
        chartType: validatedData.chartType,
        duration,
        measureCount: measures.length,
        datasetCount: chartData.datasets?.length ?? 0,
        queryTimeMs: result.query_time_ms,
      },
    });

    // Add caching headers for performance
    response.headers.set('Cache-Control', 'private, max-age=300, stale-while-revalidate=60');
    response.headers.set('X-Transform-Location', 'server');
    response.headers.set('X-Transform-Duration', `${duration}ms`);

    return response;
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Chart data transformation failed', error, {
      operation: 'transform_chart_data',
      userId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      duration,
      component: 'analytics',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to transform chart data',
      500,
      request
    );
  }
};

export const POST = rbacRoute(transformChartDataHandler, {
  permission: ['analytics:read:organization', 'analytics:read:all'],
  rateLimit: 'api',
});
