/**
 * Dimension Values API
 *
 * GET /api/admin/analytics/charts/:chartId/dimensions/:column/values
 *
 * Returns unique values for a specific expansion dimension column,
 * respecting current filters and user RBAC.
 */

import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { dimensionDiscoveryService } from '@/lib/services/analytics/dimension-discovery-service';
import { createRBACChartsService } from '@/lib/services/rbac-charts-service';
import { log } from '@/lib/logger';
import type { ChartFilter } from '@/lib/types/analytics';
import type { UserContext } from '@/lib/types/rbac';
import { DIMENSION_EXPANSION_LIMITS } from '@/lib/constants/dimension-expansion';

const getDimensionValuesHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const { params } = args[0] as { params: { chartId: string; column: string } };
  const startTime = Date.now();

  try {
    const { chartId, column } = params;
    const { searchParams } = new URL(request.url);

    // Parse query parameters (current filters)
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const practiceUidsParam = searchParams.get('practiceUids');
    const practiceUids = practiceUidsParam ? JSON.parse(practiceUidsParam) : undefined;
    
    // SECURITY: Validate and clamp limit parameter
    const limitParam = parseInt(searchParams.get('limit') || String(DIMENSION_EXPANSION_LIMITS.DEFAULT), 10);
    const limit = Math.min(
      Math.max(limitParam, 1),
      DIMENSION_EXPANSION_LIMITS.MAXIMUM
    );

    // Get chart definition to find data source
    const chartsService = createRBACChartsService(userContext);
    const chartDef = await chartsService.getChartById(chartId);
    
    // Get data_source_id from the denormalized integer column
    const dataSourceId = chartDef?.data_source_id || 0;

    if (!chartDef || dataSourceId === 0) {
      return createErrorResponse('Chart not found or missing data_source_id', 404);
    }

    // Build filters from query params
    const filters: ChartFilter[] = [];

    if (startDate) {
      filters.push({ field: 'date', operator: 'gte', value: startDate });
    }

    if (endDate) {
      filters.push({ field: 'date', operator: 'lte', value: endDate });
    }

    if (practiceUids && Array.isArray(practiceUids) && practiceUids.length > 0) {
      filters.push({ field: 'practice_uid', operator: 'in', value: practiceUids });
    }

    // Get dimension values
    const result = await dimensionDiscoveryService.getDimensionValues(
      dataSourceId,
      column,
      filters,
      userContext,
      limit
    );

    const duration = Date.now() - startTime;

    log.info('Dimension values retrieved', {
      chartId,
      column,
      valueCount: result.values.length,
      filtered: result.filtered,
      userId: userContext.user_id,
      duration,
      component: 'dimensions-api',
    });

    return createSuccessResponse(result);
  } catch (error) {
    log.error('Failed to get dimension values', error as Error, {
      chartId: params.chartId,
      column: params.column,
      userId: userContext.user_id,
    });
    return createErrorResponse('Failed to get dimension values', 500);
  }
};

export const GET = rbacRoute(getDimensionValuesHandler, {
  permission: 'analytics:read:organization',
});

