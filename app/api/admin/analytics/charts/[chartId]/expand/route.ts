/**
 * Chart Dimension Expansion API
 *
 * POST /api/admin/analytics/charts/:chartId/expand
 *
 * Renders a chart expanded by dimension values, returning side-by-side
 * chart data for each unique dimension value.
 *
 * Expects finalChartConfig and runtimeFilters from the frontend to eliminate
 * metadata re-fetching and ensure consistency with base chart rendering.
 */

import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { dimensionExpansionRenderer } from '@/lib/services/analytics/dimension-expansion-renderer';
import { log } from '@/lib/logger';
import type { DimensionExpansionRequest } from '@/lib/types/dimensions';
import type { UserContext } from '@/lib/types/rbac';
import { dimensionExpansionConfigRequestSchema } from '@/lib/validations/dimension-expansion';

const expandChartHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const { params: paramsPromise } = args[0] as { params: Promise<{ chartId: string }> };
  const params = await paramsPromise;
  const startTime = Date.now();

  try {
    const chartId = params.chartId;
    const body = await request.json();

    // Validate request body
    const validatedBody = dimensionExpansionConfigRequestSchema.parse(body);

    // Build expansion request
    const expansionRequest: DimensionExpansionRequest = {
      finalChartConfig: validatedBody.finalChartConfig,
      runtimeFilters: validatedBody.runtimeFilters,
      dimensionColumn: validatedBody.dimensionColumn,
      limit: validatedBody.limit,
    };

    log.info('Dimension expansion request', {
      chartId,
      dimensionColumn: validatedBody.dimensionColumn,
      hasMultipleSeries: !!validatedBody.finalChartConfig.multipleSeries,
      hasDualAxisConfig: !!validatedBody.finalChartConfig.dualAxisConfig,
      component: 'dimensions-api',
    });

    // Render expanded chart
    const result = await dimensionExpansionRenderer.renderByDimension(
      expansionRequest,
      userContext
    );

    const duration = Date.now() - startTime;

    log.info('Chart dimension expansion completed', {
      chartId,
      dimensionColumn: expansionRequest.dimensionColumn,
      chartCount: result.charts.length,
      totalQueryTime: result.metadata.totalQueryTime,
      userId: userContext.user_id,
      duration,
      component: 'dimensions-api',
    });

    return createSuccessResponse(result);
  } catch (error) {
    log.error('Failed to expand chart by dimension', error as Error, {
      chartId: params.chartId,
      userId: userContext.user_id,
    });
    return createErrorResponse('Failed to expand chart by dimension', 500);
  }
};

export const POST = rbacRoute(expandChartHandler, {
  permission: 'analytics:read:organization',
});

