import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createErrorResponse } from '@/lib/api/responses/error';
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
  const { params } = args[0] as { params: { chartId: string } };

  log.info('Chart definition get request initiated', {
    chartId: params.chartId,
    requestingUserId: userContext.user_id,
  });

  try {
    // Use the RBAC charts service
    const chartsService = createRBACChartsService(userContext);

    const chart = await chartsService.getChartById(params.chartId);

    if (!chart) {
      return createErrorResponse('Chart definition not found', 404);
    }

    return createSuccessResponse({ chart }, 'Chart definition retrieved successfully');
  } catch (error) {
    log.error('Chart definition get error', error, {
      chartId: params.chartId,
      requestingUserId: userContext.user_id,
    });

    const errorMessage =
      process.env.NODE_ENV === 'development'
        ? error instanceof Error
          ? error.message
          : 'Unknown error'
        : 'Internal server error';

    return createErrorResponse(errorMessage, 500, request);
  }
};

// PUT - Update chart definition
const updateChartHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const { params } = args[0] as { params: { chartId: string } };

  log.info('Chart definition update request initiated', {
    chartId: params.chartId,
    requestingUserId: userContext.user_id,
  });

  try {
    // Validate request body with Zod
    const validatedData = await validateRequest(request, chartDefinitionUpdateSchema);

    // Use the RBAC charts service
    const chartsService = createRBACChartsService(userContext);

    // Fetch current chart for change tracking
    const existingChart = await chartsService.getChartById(params.chartId);
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
    };

    const updatedChart = await chartsService.updateChart(params.chartId, updateData);

    // Calculate changes for audit trail
    const changes = calculateChanges(existingChart, updateData);

    log.info('Chart definition updated successfully', {
      chartId: params.chartId,
      chartName: updatedChart.chart_name,
      updatedBy: userContext.user_id,
      changes,
      operation: 'update_chart',
      component: 'analytics',
    });

    // Invalidate chart definition cache (this specific chart)
    await analyticsCache.invalidate('chart', params.chartId);

    // Invalidate chart list cache (so updated chart appears in lists)
    await analyticsCache.invalidate('chart');

    log.info('Chart definition caches invalidated after update', {
      chartId: params.chartId,
      invalidated: ['chart-definition', 'chart-list'],
      note: 'Data cache invalidation handled at data-source layer',
    });

    return createSuccessResponse({ chart: updatedChart }, 'Chart definition updated successfully');
  } catch (error) {
    log.error('Chart definition update error', error, {
      chartId: params.chartId,
      requestingUserId: userContext.user_id,
    });

    const errorMessage =
      process.env.NODE_ENV === 'development'
        ? error instanceof Error
          ? error.message
          : 'Unknown error'
        : 'Internal server error';

    return createErrorResponse(errorMessage, 500, request);
  }
};

// DELETE - Delete chart definition (soft delete)
const deleteChartHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const { params } = args[0] as { params: { chartId: string } };

  log.info('Chart definition delete request initiated', {
    chartId: params.chartId,
    requestingUserId: userContext.user_id,
  });

  try {
    // Use the RBAC charts service
    const chartsService = createRBACChartsService(userContext);

    await chartsService.deleteChart(params.chartId);

    log.info('Chart definition deleted successfully', {
      chartId: params.chartId,
      deletedBy: userContext.user_id,
    });

    // Invalidate chart definition cache (this specific chart)
    await analyticsCache.invalidate('chart', params.chartId);

    // Invalidate chart list cache (so deleted chart is removed from lists)
    await analyticsCache.invalidate('chart');

    log.info('Chart definition caches invalidated after deletion', {
      chartId: params.chartId,
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
      chartId: params.chartId,
      requestingUserId: userContext.user_id,
    });

    const errorMessage =
      process.env.NODE_ENV === 'development'
        ? error instanceof Error
          ? error.message
          : 'Unknown error'
        : 'Internal server error';

    return createErrorResponse(errorMessage, 500, request);
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
