import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createErrorResponse, handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { analyticsCache } from '@/lib/cache/analytics-cache';
import { log, calculateChanges } from '@/lib/logger';
import { createRBACChartsService } from '@/lib/services/rbac-charts-service';
import type { UserContext } from '@/lib/types/rbac';
import { chartDefinitionUpdateSchema } from '@/lib/validations/analytics';

/**
 * Admin Analytics - Individual Chart Definition CRUD
 * GET, PUT, DELETE operations for specific chart definitions
 */

// GET - Get specific chart definition
const getChartHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const { params } = args[0] as { params: Promise<{ chartId: string }> };
  const resolvedParams = await params;

  log.info('Chart definition get request initiated', {
    chartId: resolvedParams.chartId,
    requestingUserId: userContext.user_id,
  });

  try {
    // Use the RBAC charts service
    const chartsService = createRBACChartsService(userContext);

    const chart = await chartsService.getChartById(resolvedParams.chartId);

    if (!chart) {
      return createErrorResponse('Chart definition not found', 404);
    }

    return createSuccessResponse({ chart }, 'Chart definition retrieved successfully');
  } catch (error) {
    log.error('Chart definition get error', error, {
      chartId: resolvedParams.chartId,
      requestingUserId: userContext.user_id,
    });

    const errorMessage =
      process.env.NODE_ENV === 'development'
        ? error instanceof Error
          ? error.message
          : 'Unknown error'
        : 'Internal server error';

    return handleRouteError(error, errorMessage, request);
  }
};

// PUT - Update chart definition
const updateChartHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const { params } = args[0] as { params: Promise<{ chartId: string }> };
  const resolvedParams = await params;

  log.info('Chart definition update request initiated', {
    chartId: resolvedParams.chartId,
    requestingUserId: userContext.user_id,
  });

  try {
    // Validate request body with Zod
    const validatedData = await validateRequest(request, chartDefinitionUpdateSchema);

    // Use the RBAC charts service
    const chartsService = createRBACChartsService(userContext);

    // Fetch current chart for change tracking
    const existingChart = await chartsService.getChartById(resolvedParams.chartId);
    if (!existingChart) {
      return createErrorResponse('Chart definition not found', 404);
    }

    const updateData = {
      chart_name: validatedData.chart_name,
      chart_description: validatedData.chart_description,
      chart_type: validatedData.chart_type,
      data_source: validatedData.data_source,
      chart_config: validatedData.chart_config,
      chart_category_id: validatedData.chart_category_id ?? undefined,
      is_active: validatedData.is_active,
      // Drill-down configuration
      drill_down_enabled: validatedData.drill_down_enabled,
      drill_down_type: validatedData.drill_down_type,
      drill_down_target_chart_id: validatedData.drill_down_target_chart_id,
      drill_down_button_label: validatedData.drill_down_button_label,
    };

    const updatedChart = await chartsService.updateChart(resolvedParams.chartId, updateData);

    // Calculate changes for audit trail
    const changes = calculateChanges(existingChart, updateData);

    log.info('Chart definition updated successfully', {
      chartId: resolvedParams.chartId,
      chartName: updatedChart.chart_name,
      updatedBy: userContext.user_id,
      changes,
      operation: 'update_chart',
      component: 'analytics',
    });

    // Invalidate chart definition cache (this specific chart)
    await analyticsCache.invalidate('chart', resolvedParams.chartId);

    // Invalidate chart list cache (so updated chart appears in lists)
    await analyticsCache.invalidate('chart');

    log.info('Chart definition caches invalidated after update', {
      chartId: resolvedParams.chartId,
      invalidated: ['chart-definition', 'chart-list'],
      note: 'Data cache invalidation handled at data-source layer',
    });

    return createSuccessResponse({ chart: updatedChart }, 'Chart definition updated successfully');
  } catch (error) {
    log.error('Chart definition update error', error, {
      chartId: resolvedParams.chartId,
      requestingUserId: userContext.user_id,
    });

    const errorMessage =
      process.env.NODE_ENV === 'development'
        ? error instanceof Error
          ? error.message
          : 'Unknown error'
        : 'Internal server error';

    return handleRouteError(error, errorMessage, request);
  }
};

// DELETE - Delete chart definition (soft delete)
const deleteChartHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const { params } = args[0] as { params: Promise<{ chartId: string }> };
  const resolvedParams = await params;

  log.info('Chart definition delete request initiated', {
    chartId: resolvedParams.chartId,
    requestingUserId: userContext.user_id,
  });

  try {
    // Use the RBAC charts service
    const chartsService = createRBACChartsService(userContext);

    await chartsService.deleteChart(resolvedParams.chartId);

    log.info('Chart definition deleted successfully', {
      chartId: resolvedParams.chartId,
      deletedBy: userContext.user_id,
    });

    // Invalidate chart definition cache (this specific chart)
    await analyticsCache.invalidate('chart', resolvedParams.chartId);

    // Invalidate chart list cache (so deleted chart is removed from lists)
    await analyticsCache.invalidate('chart');

    log.info('Chart definition caches invalidated after deletion', {
      chartId: resolvedParams.chartId,
      invalidated: ['chart-definition', 'chart-list'],
      note: 'Data cache invalidation handled at data-source layer',
    });

    return createSuccessResponse(
      {
        message: 'Chart deleted successfully',
      },
      'Chart definition deleted successfully'
    );
  } catch (error) {
    log.error('Chart definition delete error', error, {
      chartId: resolvedParams.chartId,
      requestingUserId: userContext.user_id,
    });

    const errorMessage =
      process.env.NODE_ENV === 'development'
        ? error instanceof Error
          ? error.message
          : 'Unknown error'
        : 'Internal server error';

    return handleRouteError(error, errorMessage, request);
  }
};

// Route exports
export const GET = rbacRoute(getChartHandler, {
  permission: ['analytics:read:all', 'analytics:read:organization', 'analytics:read:own'],
  rateLimit: 'api',
});

export const PUT = rbacRoute(updateChartHandler, {
  permission: ['charts:update:organization', 'charts:update:own', 'charts:manage:all'],
  rateLimit: 'api',
});

export const PATCH = rbacRoute(updateChartHandler, {
  permission: ['charts:update:organization', 'charts:update:own', 'charts:manage:all'],
  rateLimit: 'api',
});

export const DELETE = rbacRoute(deleteChartHandler, {
  permission: ['charts:delete:organization', 'charts:delete:own', 'charts:manage:all'],
  rateLimit: 'api',
});
