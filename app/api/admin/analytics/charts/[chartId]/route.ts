import { NextRequest } from 'next/server';
import { db, chart_definitions, chart_categories, users } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { withCSRFProtection } from '@/lib/api/middleware/csrf-validation';
import type { UserContext } from '@/lib/types/rbac';
import { createAPILogger, logDBOperation, logPerformanceMetric } from '@/lib/logger';

/**
 * Admin Analytics - Individual Chart Definition CRUD
 * GET, PUT, DELETE operations for specific chart definitions
 */

// GET - Get specific chart definition
const getChartHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const { params } = args[0] as { params: { chartId: string } };
  const startTime = Date.now();
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id);
  
  logger.info('Chart definition get request initiated', {
    chartId: params.chartId,
    requestingUserId: userContext.user_id
  });

  try {
    // Fetch specific chart definition
    const [chart] = await db
      .select()
      .from(chart_definitions)
      .leftJoin(chart_categories, eq(chart_definitions.chart_category_id, chart_categories.chart_category_id))
      .leftJoin(users, eq(chart_definitions.created_by, users.user_id))
      .where(eq(chart_definitions.chart_definition_id, params.chartId));

    if (!chart) {
      return createErrorResponse('Chart definition not found', 404);
    }

    logDBOperation(logger, 'chart_definition_get', 'chart_definitions', startTime, 1);

    return createSuccessResponse({ chart }, 'Chart definition retrieved successfully');
    
  } catch (error) {
    logger.error('Chart definition get error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      chartId: params.chartId,
      requestingUserId: userContext.user_id
    });
    
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// PUT - Update chart definition
const updateChartHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const { params } = args[0] as { params: { chartId: string } };
  const startTime = Date.now();
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id);
  
  logger.info('Chart definition update request initiated', {
    chartId: params.chartId,
    requestingUserId: userContext.user_id
  });

  try {
    const body = await request.json();

    // Update chart definition
    const [updatedChart] = await db
      .update(chart_definitions)
      .set({
        chart_name: body.chart_name,
        chart_description: body.chart_description,
        chart_type: body.chart_type,
        data_source: body.data_source,
        chart_config: body.chart_config,
        access_control: body.access_control,
        chart_category_id: body.chart_category_id,
        updated_at: new Date(),
      })
      .where(eq(chart_definitions.chart_definition_id, params.chartId))
      .returning();

    if (!updatedChart) {
      return createErrorResponse('Chart definition not found', 404);
    }

    logDBOperation(logger, 'chart_definition_update', 'chart_definitions', startTime, 1);

    logger.info('Chart definition updated successfully', {
      chartId: params.chartId,
      chartName: updatedChart.chart_name,
      updatedBy: userContext.user_id
    });

    return createSuccessResponse({ chart: updatedChart }, 'Chart definition updated successfully');
    
  } catch (error) {
    logger.error('Chart definition update error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      chartId: params.chartId,
      requestingUserId: userContext.user_id
    });
    
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// DELETE - Delete chart definition (soft delete)
const deleteChartHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const { params } = args[0] as { params: { chartId: string } };
  const startTime = Date.now();
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id);
  
  logger.info('Chart definition delete request initiated', {
    chartId: params.chartId,
    requestingUserId: userContext.user_id
  });

  try {
    // Soft delete by setting is_active to false
    const [deletedChart] = await db
      .update(chart_definitions)
      .set({
        is_active: false,
        updated_at: new Date(),
      })
      .where(eq(chart_definitions.chart_definition_id, params.chartId))
      .returning();

    if (!deletedChart) {
      return createErrorResponse('Chart definition not found', 404);
    }

    logDBOperation(logger, 'chart_definition_delete', 'chart_definitions', startTime, 1);

    logger.info('Chart definition deleted successfully', {
      chartId: params.chartId,
      chartName: deletedChart.chart_name,
      deletedBy: userContext.user_id
    });

    return createSuccessResponse({ 
      message: `Chart "${deletedChart.chart_name}" deleted successfully` 
    }, 'Chart definition deleted successfully');
    
  } catch (error) {
    logger.error('Chart definition delete error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      chartId: params.chartId,
      requestingUserId: userContext.user_id
    });
    
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// Route exports
export const GET = rbacRoute(getChartHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api'
});

export const PUT = rbacRoute(
  withCSRFProtection(
    updateChartHandler,
    '/api/admin/analytics/charts/[chartId]',
    'update_chart'
  ),
  {
    permission: 'analytics:read:all',
    rateLimit: 'api'
  }
);

export const PATCH = rbacRoute(
  withCSRFProtection(
    updateChartHandler,
    '/api/admin/analytics/charts/[chartId]',
    'update_chart'
  ),
  {
    permission: 'analytics:read:all',
    rateLimit: 'api'
  }
);

export const DELETE = rbacRoute(
  withCSRFProtection(
    deleteChartHandler,
    '/api/admin/analytics/charts/[chartId]',
    'delete_chart'
  ),
  {
    permission: 'analytics:read:all',
    rateLimit: 'api'
  }
);
