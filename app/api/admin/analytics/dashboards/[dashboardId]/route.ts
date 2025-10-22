import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { analyticsCache } from '@/lib/cache/analytics-cache';
import { log } from '@/lib/logger';
import { createRBACDashboardsService } from '@/lib/services/dashboards';
import type { UserContext } from '@/lib/types/rbac';
import { dashboardUpdateSchema } from '@/lib/validations/analytics';

/**
 * Admin Analytics - Individual Dashboard CRUD
 * GET, PUT, DELETE operations for specific dashboards
 */

// GET - Get specific dashboard
const getDashboardHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const { params } = args[0] as { params: Promise<{ dashboardId: string }> };
  const { dashboardId } = await params;
  const startTime = Date.now();

  log.info('Dashboard get request initiated', {
    dashboardId,
    requestingUserId: userContext.user_id,
  });

  try {
    // Create RBAC dashboards service
    const dashboardsService = createRBACDashboardsService(userContext);

    // Get dashboard with automatic permission checking
    const dashboard = await dashboardsService.getDashboardById(dashboardId);

    if (!dashboard) {
      return createErrorResponse('Dashboard not found', 404);
    }

    log.db('SELECT', 'dashboards', Date.now() - startTime, { rowCount: 1 });

    // Extract charts array from dashboard object to match frontend expectations
    const { charts, ...dashboardWithoutCharts } = dashboard;

    return createSuccessResponse(
      {
        dashboard: dashboardWithoutCharts,
        charts,
      },
      'Dashboard retrieved successfully'
    );
  } catch (error) {
    log.error('Dashboard get error', error, {
      dashboardId,
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

// PUT - Update dashboard
const updateDashboardHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const { params } = args[0] as { params: Promise<{ dashboardId: string }> };
  const { dashboardId } = await params;
  const startTime = Date.now();

  log.info('Dashboard update request initiated', {
    dashboardId,
    requestingUserId: userContext.user_id,
  });

  try {
    // Validate request body with Zod
    const validatedData = await validateRequest(request, dashboardUpdateSchema);

    // Create RBAC dashboards service
    const dashboardsService = createRBACDashboardsService(userContext);

    // Update dashboard through service with automatic permission checking
    // Cast is safe because validated data matches UpdateDashboardData structure
    const updatedDashboard = await dashboardsService.updateDashboard(
      dashboardId,
      validatedData as Parameters<typeof dashboardsService.updateDashboard>[1]
    );

    log.db('UPDATE', 'dashboards', Date.now() - startTime, { rowCount: 1 });

    log.info('Dashboard updated successfully', {
      dashboardId,
      dashboardName: updatedDashboard.dashboard_name,
      updatedBy: userContext.user_id,
    });

    // Targeted cache invalidation
    // Only invalidate what changed:
    // 1. This specific dashboard (metadata, chart associations)
    // 2. Dashboard list (for sidebar, dashboard list page)
    // 3. Chart definitions - ALWAYS invalidate if chart_ids changed (per requirement)
    // 4. Chart data remains valid (data hasn't changed, only dashboard metadata/layout)

    // Invalidate this specific dashboard
    await analyticsCache.invalidate('dashboard', dashboardId);

    // Invalidate dashboard list (affects sidebar, dashboard management page)
    await analyticsCache.invalidate('dashboard');

    // If chart associations changed, invalidate affected chart definitions
    if (validatedData.chart_ids && validatedData.chart_ids.length > 0) {
      // Parallelize invalidations for performance with many charts
      await Promise.all(
        validatedData.chart_ids.map(chartId =>
          analyticsCache.invalidate('chart', chartId)
        )
      );
      // Also invalidate chart list cache
      await analyticsCache.invalidate('chart');

      log.info('Chart definitions invalidated due to dashboard association changes', {
        dashboardId,
        chartsInvalidated: validatedData.chart_ids.length,
      });
    }

    log.info('Dashboard cache invalidated', {
      dashboardId,
      invalidated: validatedData.chart_ids
        ? ['dashboard-specific', 'dashboard-list', 'chart-definitions']
        : ['dashboard-specific', 'dashboard-list'],
      preserved: ['chart-data'],
    });

    return createSuccessResponse({ dashboard: updatedDashboard }, 'Dashboard updated successfully');
  } catch (error) {
    log.error('Dashboard update error', error, {
      dashboardId,
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

// DELETE - Delete dashboard
const deleteDashboardHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const { params } = args[0] as { params: Promise<{ dashboardId: string }> };
  const { dashboardId } = await params;
  const startTime = Date.now();

  log.info('Dashboard delete request initiated', {
    dashboardId,
    requestingUserId: userContext.user_id,
  });

  try {
    // Create RBAC dashboards service
    const dashboardsService = createRBACDashboardsService(userContext);

    // Get dashboard before deletion for logging and cache invalidation
    const dashboard = await dashboardsService.getDashboardById(dashboardId);

    if (!dashboard) {
      return createErrorResponse('Dashboard not found', 404);
    }

    // Delete dashboard through service with automatic permission checking
    await dashboardsService.deleteDashboard(dashboardId);

    log.db('DELETE', 'dashboards', Date.now() - startTime, { rowCount: 1 });

    log.info('Dashboard deleted successfully', {
      dashboardId,
      dashboardName: dashboard.dashboard_name,
      deletedBy: userContext.user_id,
    });

    // Targeted cache invalidation after deletion
    // Only invalidate:
    // 1. This specific dashboard (now deleted)
    // 2. Dashboard list (for sidebar, dashboard list page)
    // Chart definitions and chart data remain valid (charts still exist, just dashboard association removed)

    // Invalidate this specific dashboard
    await analyticsCache.invalidate('dashboard', dashboardId);

    // Invalidate dashboard list (affects sidebar, dashboard management page)
    await analyticsCache.invalidate('dashboard');

    log.info('Dashboard cache invalidated after deletion', {
      dashboardId,
      invalidated: ['dashboard-specific', 'dashboard-list'],
      preserved: ['chart-definitions', 'chart-data'],
    });

    return createSuccessResponse(
      {
        message: `Dashboard "${dashboard.dashboard_name}" deleted successfully`,
      },
      'Dashboard deleted successfully'
    );
  } catch (error) {
    log.error('Dashboard delete error', error, {
      dashboardId,
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
export const GET = rbacRoute(getDashboardHandler, {
  permission: ['analytics:read:all', 'analytics:read:organization', 'analytics:read:own'],
  rateLimit: 'api',
});

export const PUT = rbacRoute(updateDashboardHandler, {
  permission: ['dashboards:update:organization', 'dashboards:update:own', 'dashboards:manage:all'],
  rateLimit: 'api',
});

export const PATCH = rbacRoute(updateDashboardHandler, {
  permission: ['dashboards:update:organization', 'dashboards:update:own', 'dashboards:manage:all'],
  rateLimit: 'api',
});

export const DELETE = rbacRoute(deleteDashboardHandler, {
  permission: ['dashboards:delete:organization', 'dashboards:delete:own', 'dashboards:manage:all'],
  rateLimit: 'api',
});
