import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { log } from '@/lib/logger';
import { createRBACDashboardsService } from '@/lib/services/rbac-dashboards-service';
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

    // Get dashboard before deletion for logging
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
