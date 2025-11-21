/**
 * Chart Dimension Expansion API
 *
 * POST /api/admin/analytics/charts/:chartId/expand
 *
 * Renders a chart expanded by dimension values, returning side-by-side
 * chart data for each unique dimension value.
 * 
 * PERFORMANCE OPTIMIZATION:
 * - NEW FORMAT: Accepts chartExecutionConfig from frontend (eliminates metadata re-fetching)
 * - OLD FORMAT: Accepts chartDefinitionId only (backwards compatible, slower)
 * 
 * Frontend should send chartExecutionConfig when available to save 100-200ms per request.
 */

import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { dimensionExpansionRenderer } from '@/lib/services/analytics/dimension-expansion-renderer';
import { log } from '@/lib/logger';
import type { DimensionExpansionRequest } from '@/lib/types/dimensions';
import type { UserContext } from '@/lib/types/rbac';
import { 
  dimensionExpansionRequestSchema,
  dimensionExpansionConfigRequestSchema 
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

    // Detect request format and validate accordingly
    let expansionRequest: DimensionExpansionRequest;

    if (body.finalChartConfig && body.runtimeFilters) {
      // SIMPLE FORMAT: Reuse configs from base chart render
      const validatedBody = dimensionExpansionConfigRequestSchema.parse(body);
      
      expansionRequest = {
        finalChartConfig: validatedBody.finalChartConfig,
        runtimeFilters: validatedBody.runtimeFilters,
        dimensionColumn: validatedBody.dimensionColumn,
        limit: validatedBody.limit,
      };

      log.info('Dimension expansion request (simple reuse path)', {
        chartId,
        dimensionColumn: validatedBody.dimensionColumn,
        hasMultipleSeries: !!validatedBody.finalChartConfig.multipleSeries,
        hasDualAxisConfig: !!validatedBody.finalChartConfig.dualAxisConfig,
        optimized: true,
        component: 'dimensions-api',
      });
    } else {
      // OLD FORMAT: Legacy path with metadata re-fetching
      const validatedBody = dimensionExpansionRequestSchema.parse(body);
      
      expansionRequest = {
        chartDefinitionId: chartId,
        dimensionColumn: validatedBody.dimensionColumn,
        baseFilters: validatedBody.baseFilters,
        limit: validatedBody.limit,
      };

      log.info('Dimension expansion request (legacy path)', {
        chartId,
        dimensionColumn: validatedBody.dimensionColumn,
        optimized: false,
        willFetchMetadata: true,
        component: 'dimensions-api',
      });
    }

    // Render expanded chart (renderer handles both formats)
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

