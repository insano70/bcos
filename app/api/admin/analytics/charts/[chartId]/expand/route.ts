/**
 * Chart Dimension Expansion API
 *
 * POST /api/admin/analytics/charts/:chartId/expand
 *
 * Renders a chart expanded by dimension values, returning side-by-side
 * chart data for each unique dimension value.
 */

import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { dimensionExpansionRenderer } from '@/lib/services/analytics/dimension-expansion-renderer';
import { log } from '@/lib/logger';
import type { DimensionExpansionRequest } from '@/lib/types/dimensions';
import type { UserContext } from '@/lib/types/rbac';
import { dimensionExpansionRequestSchema } from '@/lib/validations/dimension-expansion';

const expandChartHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const { params } = args[0] as { params: { chartId: string } };
  const startTime = Date.now();

  try {
    const chartId = params.chartId;
    const body = await request.json();

    // SECURITY: Validate request body with Zod schema
    const validatedBody = dimensionExpansionRequestSchema.parse(body);

    // Build expansion request
    const expansionRequest: DimensionExpansionRequest = {
      chartDefinitionId: chartId,
      dimensionColumn: validatedBody.dimensionColumn,
      baseFilters: validatedBody.baseFilters,
      limit: validatedBody.limit,
    };

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

