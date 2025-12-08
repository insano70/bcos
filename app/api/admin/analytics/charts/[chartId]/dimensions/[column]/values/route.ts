/**
 * Dimension Values API
 *
 * GET /api/admin/analytics/charts/:chartId/dimensions/:column/values
 * POST /api/admin/analytics/charts/:chartId/dimensions/:column/values
 *
 * Returns unique values for a specific expansion dimension column,
 * respecting current filters and user RBAC.
 *
 * GET: Uses query parameters for simple filters
 * POST: Uses request body for complex runtime filters (Phase 1 value-level selection)
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
  const { params } = args[0] as { params: Promise<{ chartId: string; column: string }> };
  const resolvedParams = await params;
  const startTime = Date.now();

  try {
    const { chartId, column } = resolvedParams;
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
      chartId: resolvedParams.chartId,
      column: resolvedParams.column,
      userId: userContext.user_id,
    });
    return createErrorResponse('Failed to get dimension values', 500);
  }
};

export const GET = rbacRoute(getDimensionValuesHandler, {
  permission: 'analytics:read:organization',
  rateLimit: 'api',
});

/**
 * POST handler for dimension values with complex runtime filters
 *
 * Phase 1: Supports value-level selection by accepting full runtime filters
 * in the request body instead of query parameters.
 */
const postDimensionValuesHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const { params: paramsPromise } = args[0] as { params: Promise<{ chartId: string; column: string }> };
  const params = await paramsPromise;
  const startTime = Date.now();

  try {
    const { chartId, column } = params;
    const body = await request.json();

    // Extract runtime filters from request body
    const runtimeFilters = body.runtimeFilters || {};
    const limitParam = body.limit || DIMENSION_EXPANSION_LIMITS.DEFAULT;
    
    // SECURITY: Validate and clamp limit parameter
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

    // Build filters from runtime filters
    const filters: ChartFilter[] = [];

    // Handle date filters
    if (runtimeFilters.startDate) {
      filters.push({ field: 'date', operator: 'gte', value: runtimeFilters.startDate });
    }
    if (runtimeFilters.endDate) {
      filters.push({ field: 'date', operator: 'lte', value: runtimeFilters.endDate });
    }

    // Handle practice filters (already resolved by frontend/dashboard)
    if (runtimeFilters.practiceUids && Array.isArray(runtimeFilters.practiceUids) && runtimeFilters.practiceUids.length > 0) {
      filters.push({ field: 'practice_uid', operator: 'in', value: runtimeFilters.practiceUids });
    }

    // Handle measure filter (required for measure-based data sources)
    if (runtimeFilters.measure) {
      filters.push({ field: 'measure', operator: 'eq', value: runtimeFilters.measure });
    }

    // Handle frequency/time_period filter (required for measure-based data sources)
    if (runtimeFilters.frequency) {
      filters.push({ field: 'frequency', operator: 'eq', value: runtimeFilters.frequency });
    }

    // Handle advanced filters if present
    if (runtimeFilters.advancedFilters && Array.isArray(runtimeFilters.advancedFilters)) {
      filters.push(...runtimeFilters.advancedFilters);
    }

    log.debug('Building dimension values query with runtime filters', {
      chartId,
      column,
      filterCount: filters.length,
      hasDateFilters: Boolean(runtimeFilters.startDate || runtimeFilters.endDate),
      hasPracticeFilters: Boolean(runtimeFilters.practiceUids),
      hasMeasure: Boolean(runtimeFilters.measure),
      hasFrequency: Boolean(runtimeFilters.frequency),
      hasAdvancedFilters: Boolean(runtimeFilters.advancedFilters),
      measure: runtimeFilters.measure,
      frequency: runtimeFilters.frequency,
      component: 'dimensions-api',
    });

    // Get dimension values
    const result = await dimensionDiscoveryService.getDimensionValues(
      dataSourceId,
      column,
      filters,
      userContext,
      limit
    );

    const duration = Date.now() - startTime;

    log.info('Dimension values retrieved (POST)', {
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
    log.error('Failed to get dimension values (POST)', error as Error, {
      chartId: params.chartId,
      column: params.column,
      userId: userContext.user_id,
    });
    return createErrorResponse('Failed to get dimension values', 500);
  }
};

export const POST = rbacRoute(postDimensionValuesHandler, {
  permission: 'analytics:read:organization',
  rateLimit: 'api',
});

