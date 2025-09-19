import { NextRequest } from 'next/server';
import { db, dashboards, dashboard_charts, chart_categories, users } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import type { UserContext } from '@/lib/types/rbac';
import { createAPILogger, logDBOperation, logPerformanceMetric } from '@/lib/logger';

/**
 * Admin Analytics - Individual Dashboard CRUD
 * GET, PUT, DELETE operations for specific dashboards
 */

// GET - Get specific dashboard
const getDashboardHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const { params } = args[0] as { params: { dashboardId: string } };
  const startTime = Date.now();
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id);
  
  logger.info('Dashboard get request initiated', {
    dashboardId: params.dashboardId,
    requestingUserId: userContext.user_id
  });

  try {
    // Fetch specific dashboard with associated charts
    const [dashboard] = await db
      .select()
      .from(dashboards)
      .leftJoin(chart_categories, eq(dashboards.dashboard_category_id, chart_categories.chart_category_id))
      .leftJoin(users, eq(dashboards.created_by, users.user_id))
      .where(eq(dashboards.dashboard_id, params.dashboardId));

    if (!dashboard) {
      return createErrorResponse('Dashboard not found', 404);
    }

    // Get associated charts
    const dashboardCharts = await db
      .select()
      .from(dashboard_charts)
      .where(eq(dashboard_charts.dashboard_id, params.dashboardId));

    logDBOperation(logger, 'dashboard_get', 'dashboards', startTime, 1);

    return createSuccessResponse({ 
      dashboard,
      charts: dashboardCharts
    }, 'Dashboard retrieved successfully');
    
  } catch (error) {
    logger.error('Dashboard get error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      dashboardId: params.dashboardId,
      requestingUserId: userContext.user_id
    });
    
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// PUT - Update dashboard
const updateDashboardHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const { params } = args[0] as { params: { dashboardId: string } };
  const startTime = Date.now();
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id);
  
  logger.info('Dashboard update request initiated', {
    dashboardId: params.dashboardId,
    requestingUserId: userContext.user_id
  });

  try {
    const body = await request.json();

    // Update dashboard
    const [updatedDashboard] = await db
      .update(dashboards)
      .set({
        dashboard_name: body.dashboard_name,
        dashboard_description: body.dashboard_description,
        layout_config: body.layout_config,
        dashboard_category_id: body.dashboard_category_id,
        updated_at: new Date(),
      })
      .where(eq(dashboards.dashboard_id, params.dashboardId))
      .returning();

    if (!updatedDashboard) {
      return createErrorResponse('Dashboard not found', 404);
    }

    // Update chart associations if provided
    if (body.chart_ids && Array.isArray(body.chart_ids)) {
      // Remove existing chart associations
      await db
        .delete(dashboard_charts)
        .where(eq(dashboard_charts.dashboard_id, params.dashboardId));

      // Add new chart associations
      if (body.chart_ids.length > 0) {
        const chartAssociations = body.chart_ids.map((chartId: string, index: number) => ({
          dashboard_id: params.dashboardId,
          chart_definition_id: chartId,
          position_config: body.chart_positions?.[index] || { x: 0, y: index, w: 6, h: 4 }
        }));

        await db
          .insert(dashboard_charts)
          .values(chartAssociations);
      }

      logger.info('Dashboard chart associations updated', {
        dashboardId: params.dashboardId,
        chartCount: body.chart_ids.length
      });
    }

    logDBOperation(logger, 'dashboard_update', 'dashboards', startTime, 1);

    logger.info('Dashboard updated successfully', {
      dashboardId: params.dashboardId,
      dashboardName: updatedDashboard.dashboard_name,
      updatedBy: userContext.user_id
    });

    return createSuccessResponse({ dashboard: updatedDashboard }, 'Dashboard updated successfully');
    
  } catch (error) {
    logger.error('Dashboard update error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      dashboardId: params.dashboardId,
      requestingUserId: userContext.user_id
    });
    
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// DELETE - Delete dashboard (soft delete)
const deleteDashboardHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const { params } = args[0] as { params: { dashboardId: string } };
  const startTime = Date.now();
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id);
  
  logger.info('Dashboard delete request initiated', {
    dashboardId: params.dashboardId,
    requestingUserId: userContext.user_id
  });

  try {
    // Soft delete by setting is_active to false
    const [deletedDashboard] = await db
      .update(dashboards)
      .set({
        is_active: false,
        updated_at: new Date(),
      })
      .where(eq(dashboards.dashboard_id, params.dashboardId))
      .returning();

    if (!deletedDashboard) {
      return createErrorResponse('Dashboard not found', 404);
    }

    logDBOperation(logger, 'dashboard_delete', 'dashboards', startTime, 1);

    logger.info('Dashboard deleted successfully', {
      dashboardId: params.dashboardId,
      dashboardName: deletedDashboard.dashboard_name,
      deletedBy: userContext.user_id
    });

    return createSuccessResponse({ 
      message: `Dashboard "${deletedDashboard.dashboard_name}" deleted successfully` 
    }, 'Dashboard deleted successfully');
    
  } catch (error) {
    logger.error('Dashboard delete error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      dashboardId: params.dashboardId,
      requestingUserId: userContext.user_id
    });
    
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// Route exports
export const GET = rbacRoute(getDashboardHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api'
});

export const PUT = rbacRoute(updateDashboardHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api'
});

export const PATCH = rbacRoute(updateDashboardHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api'
});

export const DELETE = rbacRoute(deleteDashboardHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api'
});
