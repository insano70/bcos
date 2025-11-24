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
import type { MultiDimensionExpansionRequest } from '@/lib/types/dimensions';
import type { UserContext } from '@/lib/types/rbac';
import {
  dimensionExpansionConfigRequestSchema,
  multiDimensionExpansionRequestSchema,
} from '@/lib/validations/dimension-expansion';

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

    // Unified handling: Treat all requests as multi-dimension
    const isMultiDimensionRequest = Array.isArray(body.dimensionColumns);
    
    // Normalize to multi-dimension request
    const expansionRequest: MultiDimensionExpansionRequest = {
      finalChartConfig: body.finalChartConfig,
      runtimeFilters: body.runtimeFilters,
      // Convert single dimensionColumn to array if necessary
      dimensionColumns: isMultiDimensionRequest 
        ? body.dimensionColumns 
        : [body.dimensionColumn],
      limit: body.limit,
      offset: body.offset,
    };
    
    // Validate request schema based on type (for safety)
    if (isMultiDimensionRequest) {
      multiDimensionExpansionRequestSchema.parse(body);
    } else {
      dimensionExpansionConfigRequestSchema.parse(body);
    }

    log.info('Dimension expansion request (unified)', {
      chartId,
      dimensionColumns: expansionRequest.dimensionColumns,
      dimensionCount: expansionRequest.dimensionColumns.length,
      originalType: isMultiDimensionRequest ? 'multi' : 'single',
      component: 'dimensions-api',
    });

    // Render expanded chart using unified multi-dimension renderer
    const result = await dimensionExpansionRenderer.renderByMultipleDimensions(
      expansionRequest,
      userContext
    );

    const duration = Date.now() - startTime;

    log.info('Dimension expansion completed', {
      chartId,
      dimensionColumns: expansionRequest.dimensionColumns,
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
  rateLimit: 'api', // 100 req/min - Dimension expansion is computationally expensive
});

