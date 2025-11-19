/**
 * Chart Expansion Dimensions API
 *
 * GET /api/admin/analytics/charts/:chartId/dimensions
 *
 * Returns available expansion dimensions for a chart based on
 * data source column configuration.
 */

import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { dimensionDiscoveryService } from '@/lib/services/analytics/dimension-discovery-service';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

const getDimensionsHandler = async (
  _request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const { params: paramsPromise } = args[0] as { params: Promise<{ chartId: string }> };
  const params = await paramsPromise;
  const startTime = Date.now();

  try {
    const chartId = params.chartId;

    // Get expansion dimensions
    const result = await dimensionDiscoveryService.getChartExpansionDimensions(
      chartId,
      userContext
    );

    const duration = Date.now() - startTime;

    log.info('Chart expansion dimensions retrieved', {
      chartId,
      dimensionCount: result.dimensions.length,
      userId: userContext.user_id,
      duration,
      component: 'dimensions-api',
    });

    return createSuccessResponse(result);
  } catch (error) {
    log.error('Failed to get chart expansion dimensions', error as Error, {
      chartId: params.chartId,
      userId: userContext.user_id,
    });
    return createErrorResponse('Failed to get chart expansion dimensions', 500);
  }
};

export const GET = rbacRoute(getDimensionsHandler, {
  permission: 'analytics:read:organization',
});

