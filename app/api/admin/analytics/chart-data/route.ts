import type { NextRequest } from 'next/server';

import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { validateRequest } from '@/lib/api/middleware/validation';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import type { UserContext } from '@/lib/types/rbac';
import type { ChartData, AggAppMeasure } from '@/lib/types/analytics';
import { chartDataRequestSchema } from '@/lib/validations/analytics';
import { SimplifiedChartTransformer } from '@/lib/utils/simplified-chart-transformer';
import { loadColumnMetadata } from '@/lib/utils/chart-metadata-loader.server';
import { log } from '@/lib/logger';

/**
 * Transform Chart Data Handler
 * POST /api/admin/analytics/chart-data
 *
 * Transforms raw analytics data into Chart.js format on the server side.
 * This approach reduces client bundle size, improves mobile performance,
 * and enables response caching.
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
    // Debug: Log request body before validation
    const requestBody = await request.clone().json();
    log.info('Chart data request body received', {
      requestingUserId: userContext.user_id,
      body: requestBody,
    });

    const validatedData = await validateRequest(request, chartDataRequestSchema);

    log.info('Chart data request validated', {
      requestingUserId: userContext.user_id,
      chartType: validatedData.chartType,
      measureCount: validatedData.measures.length,
      hasDataSourceId: Boolean(validatedData.dataSourceId),
      hasMultipleSeries: Boolean(validatedData.multipleSeries),
      hasPeriodComparison: Boolean(validatedData.periodComparison),
    });

    // 2. Load column metadata (server-side only)
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

    // 3. Create transformer with metadata
    const transformer = new SimplifiedChartTransformer(metadata);

    // 4. Transform data based on chart type and features
    // Cast measures to AggAppMeasure[] since Zod validation uses Record type
    const measures = validatedData.measures as unknown as AggAppMeasure[];

    // Map stacked-bar to bar for transformation (stacking is handled by Chart.js config)
    const transformChartType = validatedData.chartType === 'stacked-bar' ? 'bar' : validatedData.chartType;

    // Debug: Log sample measure and grouping info
    log.info('Transformation parameters', {
      requestingUserId: userContext.user_id,
      transformChartType,
      groupBy: validatedData.groupBy,
      sampleMeasure: measures[0],
      uniqueGroupValues: [...new Set(measures.slice(0, 10).map(m => (m as Record<string, unknown>)[validatedData.groupBy]))],
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
      measureCount: validatedData.measures.length,
      datasetCount: chartData.datasets?.length ?? 0,
      labelCount: chartData.labels?.length ?? 0,
    });

    // 5. Return transformed data with metadata and caching headers
    const response = createSuccessResponse({
      chartData,
      metadata: {
        transformedAt: new Date().toISOString(),
        chartType: validatedData.chartType,
        duration,
        measureCount: validatedData.measures.length,
        datasetCount: chartData.datasets?.length ?? 0,
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
