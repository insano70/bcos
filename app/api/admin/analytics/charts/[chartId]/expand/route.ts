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
import { handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { dimensionExpansionRenderer } from '@/lib/services/analytics/dimension-expansion-renderer';
import { log } from '@/lib/logger';
import type { MultiDimensionExpansionRequest, DimensionValueSelection } from '@/lib/types/dimensions';
import type { UserContext } from '@/lib/types/rbac';
import {
  dimensionExpansionConfigRequestSchema,
  multiDimensionExpansionRequestSchema,
  valueLevelExpansionRequestSchema,
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

    // Determine request type: value-level (Phase 1), multi-dimension, or single-dimension
    const hasValueSelections = Array.isArray(body.selections) && body.selections.length > 0;
    const isMultiDimensionRequest = Array.isArray(body.dimensionColumns);
    
    // Get dimension columns from selections or direct specification
    let dimensionColumns: string[];
    let selections: DimensionValueSelection[] | undefined;
    
    if (hasValueSelections) {
      // Phase 1: Value-level selection - derive dimension columns from selections
      valueLevelExpansionRequestSchema.parse(body);
      selections = body.selections as DimensionValueSelection[];
      dimensionColumns = selections.map(s => s.columnName);
    } else if (isMultiDimensionRequest) {
      multiDimensionExpansionRequestSchema.parse(body);
      dimensionColumns = body.dimensionColumns;
    } else {
      // Legacy single-dimension request
      dimensionExpansionConfigRequestSchema.parse(body);
      dimensionColumns = [body.dimensionColumn];
    }
    
    // Normalize to multi-dimension request (renderer handles selections internally)
    const expansionRequest: MultiDimensionExpansionRequest & { selections?: DimensionValueSelection[] } = {
      finalChartConfig: body.finalChartConfig,
      runtimeFilters: body.runtimeFilters,
      dimensionColumns,
      limit: body.limit,
      offset: body.offset,
    };
    
    // Add selections to request if using value-level expansion
    if (selections) {
      expansionRequest.selections = selections;
    }

    log.info('Dimension expansion request (unified)', {
      chartId,
      dimensionColumns: expansionRequest.dimensionColumns,
      dimensionCount: expansionRequest.dimensionColumns.length,
      hasValueSelections,
      selectionCounts: hasValueSelections 
        ? selections?.map(s => ({ col: s.columnName, values: s.selectedValues.length }))
        : undefined,
      originalType: hasValueSelections ? 'value-level' : (isMultiDimensionRequest ? 'multi' : 'single'),
      operation: 'expand_chart_by_dimension',
      component: 'analytics',
    });

    // Render expanded chart using unified multi-dimension renderer
    // Note: Renderer handles selections internally via type assertion
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
      operation: 'expand_chart_by_dimension',
      component: 'analytics',
    });

    return createSuccessResponse(result);
  } catch (error) {
    log.error('Failed to expand chart by dimension', error as Error, {
      chartId: params.chartId,
      userId: userContext.user_id,
      operation: 'expand_chart_by_dimension',
      component: 'analytics',
    });
    return handleRouteError(error, 'Failed to expand chart by dimension', request);
  }
};

export const POST = rbacRoute(expandChartHandler, {
  permission: 'analytics:read:organization',
  rateLimit: 'api', // 100 req/min - Dimension expansion is computationally expensive
});

