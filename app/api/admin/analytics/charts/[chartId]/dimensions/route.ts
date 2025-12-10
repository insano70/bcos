/**
 * Chart Expansion Dimensions API
 *
 * POST /api/admin/analytics/charts/:chartId/dimensions
 *
 * Returns available expansion dimensions for a chart with value counts.
 * Accepts current chart filters to calculate accurate dimension value counts.
 */

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { rbacRoute } from '@/lib/api/route-handlers';
import { handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { dimensionDiscoveryService } from '@/lib/services/analytics/dimension-discovery-service';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

/**
 * Request validation schema for dimension filters
 */
const dimensionFiltersSchema = z.object({
  runtimeFilters: z.record(z.string(), z.unknown()).optional(),
});

const getDimensionsHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const { params: paramsPromise } = args[0] as { params: Promise<{ chartId: string }> };
  const params = await paramsPromise;
  const startTime = Date.now();

  try {
    const chartId = params.chartId;

    // Parse and validate request body for filters (optional)
    let filters: Record<string, unknown> | undefined;
    try {
      const rawBody = await request.json();
      const parseResult = dimensionFiltersSchema.safeParse(rawBody);
      if (parseResult.success) {
        filters = parseResult.data.runtimeFilters;
      }
      // If validation fails, proceed without filters (graceful degradation)
    } catch {
      // If no body or invalid JSON, proceed without filters
      filters = undefined;
    }

    // Get expansion dimensions with value counts
    const result = await dimensionDiscoveryService.getChartExpansionDimensionsWithCounts(
      chartId,
      userContext,
      filters
    );

    const duration = Date.now() - startTime;

    log.info('Chart expansion dimensions retrieved with counts', {
      chartId,
      dimensionCount: result.dimensions.length,
      hasFilters: !!filters,
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
    return handleRouteError(error, 'Failed to get chart expansion dimensions', request);
  }
};

export const POST = rbacRoute(getDimensionsHandler, {
  permission: 'analytics:read:organization',
  rateLimit: 'api',
});
