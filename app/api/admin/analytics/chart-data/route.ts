import type { NextRequest } from 'next/server';

import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { validateRequest } from '@/lib/api/middleware/validation';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import type { UserContext } from '@/lib/types/rbac';
import type { ChartData, AggAppMeasure, AnalyticsQueryParams, ChartRenderContext } from '@/lib/types/analytics';
import { chartDataRequestSchema } from '@/lib/validations/analytics';
import { SimplifiedChartTransformer } from '@/lib/utils/simplified-chart-transformer';
import { loadColumnMetadata } from '@/lib/utils/chart-metadata-loader.server';
import { log } from '@/lib/logger';
import { analyticsQueryBuilder } from '@/lib/services/analytics-query-builder';
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

  log.info('Transform chart data request initiated', {
    requestingUserId: userContext.user_id,
    currentOrganizationId: userContext.current_organization_id,
  });

  try {
    // 1. Validate request body
    const requestBody = await request.clone().json();
    log.info('Chart data request received', {
      requestingUserId: userContext.user_id,
      chartType: requestBody.chartType,
      measure: requestBody.measure,
      hasMultipleSeries: Boolean(requestBody.multipleSeries),
    });

    const validatedData = await validateRequest(request, chartDataRequestSchema);

    log.info('Chart data request validated', {
      requestingUserId: userContext.user_id,
      chartType: validatedData.chartType,
      measure: validatedData.measure,
      hasDataSourceId: Boolean(validatedData.dataSourceId),
      hasMultipleSeries: Boolean(validatedData.multipleSeries),
      hasPeriodComparison: Boolean(validatedData.periodComparison),
    });

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

    // Build chart render context from user context with proper RBAC
    const chartContext: ChartRenderContext = {
      user_id: userContext.user_id,
      accessible_practices: [],
      accessible_providers: [],
      roles: userContext.roles?.map((role) => role.name) || [],
    };

    log.info('Fetching measures from analytics database', {
      requestingUserId: userContext.user_id,
      queryParams: {
        measure: queryParams.measure,
        frequency: queryParams.frequency,
        hasFilters: Boolean(queryParams.advanced_filters?.length),
        hasMultipleSeries: Boolean(queryParams.multiple_series?.length),
      },
    });

    // Fetch measures
    const result = await analyticsQueryBuilder.queryMeasures(queryParams, chartContext);
    let measures = result.data;

    log.info('Measures fetched successfully', {
      requestingUserId: userContext.user_id,
      measureCount: measures.length,
      queryTimeMs: result.query_time_ms,
    });

    // 3. Apply calculated fields if specified
    if (validatedData.calculatedField && measures.length > 0) {
      log.info('Applying calculated field', {
        requestingUserId: userContext.user_id,
        calculatedField: validatedData.calculatedField,
        originalCount: measures.length,
      });

      measures = calculatedFieldsService.applyCalculatedField(validatedData.calculatedField, measures);

      log.info('Calculated field applied', {
        requestingUserId: userContext.user_id,
        processedCount: measures.length,
      });
    }

    // 4. Load column metadata (server-side only)
    const metadata = validatedData.dataSourceId
      ? await loadColumnMetadata(validatedData.dataSourceId)
      : undefined;

    log.info('Column metadata loaded', {
      requestingUserId: userContext.user_id,
      dataSourceId: validatedData.dataSourceId,
      columnCount: metadata?.size ?? 0,
      hasMetadata: Boolean(metadata),
      groupByColumn: metadata?.get(validatedData.groupBy),
    });

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

    // Debug: Log sample measure and grouping info
    const sampleMeasures = measures.slice(0, 5);
    const groupByField = validatedData.groupBy;
    const groupValues = measures.map(m => (m as Record<string, unknown>)[groupByField]);
    const uniqueGroupValues = Array.from(new Set(groupValues));

    log.info('Transformation parameters', {
      requestingUserId: userContext.user_id,
      transformChartType,
      groupBy: groupByField,
      totalMeasures: measures.length,
      sampleMeasures: sampleMeasures.map(m => ({
        entity_name: (m as Record<string, unknown>).entity_name,
        provider_name: (m as Record<string, unknown>).provider_name,
        measure_value: m.measure_value,
        [groupByField]: (m as Record<string, unknown>)[groupByField],
      })),
      uniqueGroupValuesCount: uniqueGroupValues.length,
      uniqueGroupValuesSample: uniqueGroupValues.slice(0, 10),
      hasNullValues: groupValues.filter(v => v == null).length,
      hasUndefinedValues: groupValues.filter(v => v === undefined).length,
    });

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

    log.info('Chart data transformed successfully', {
      requestingUserId: userContext.user_id,
      duration,
      chartType: validatedData.chartType,
      measureCount: measures.length,
      datasetCount: chartData.datasets?.length ?? 0,
      labelCount: chartData.labels?.length ?? 0,
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

    log.error('Transform chart data failed', error, {
      duration,
      requestingUserId: userContext.user_id,
      currentOrganizationId: userContext.current_organization_id,
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
