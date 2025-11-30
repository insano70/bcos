import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { analyticsCache } from '@/lib/cache/analytics-cache';
import { calculateChanges, log, logTemplates } from '@/lib/logger';
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

  try {
    // Create RBAC dashboards service
    const dashboardsService = createRBACDashboardsService(userContext);

    // Get dashboard with automatic permission checking
    const dashboard = await dashboardsService.getDashboardById(dashboardId);

    if (!dashboard) {
      return createErrorResponse('Dashboard not found', 404);
    }

    // Extract charts array from dashboard object to match frontend expectations
    const { charts, ...dashboardWithoutCharts } = dashboard;

    const template = logTemplates.crud.read('dashboard', {
      resourceId: dashboardId,
      resourceName: dashboard.dashboard_name,
      userId: userContext.user_id,
      found: true,
      duration: Date.now() - startTime,
      metadata: {
        chartCount: charts.length,
        isActive: dashboard.is_active,
      },
    });
    log.info(template.message, template.context);

    return createSuccessResponse(
      {
        dashboard: dashboardWithoutCharts,
        charts,
      },
      'Dashboard retrieved successfully'
    );
  } catch (error) {
    log.error('Dashboard get error', error, {
      operation: 'read_dashboard',
      dashboardId,
      userId: userContext.user_id,
      duration: Date.now() - startTime,
      component: 'admin',
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

  try {
    // Validate request body with Zod
    const validatedData = await validateRequest(request, dashboardUpdateSchema);

    // Create RBAC dashboards service
    const dashboardsService = createRBACDashboardsService(userContext);

    // Get before state for change tracking
    const before = await dashboardsService.getDashboardById(dashboardId);
    if (!before) {
      return createErrorResponse('Dashboard not found', 404);
    }

    // Update dashboard through service with automatic permission checking
    // Cast is safe because validated data matches UpdateDashboardData structure
    const updatedDashboard = await dashboardsService.updateDashboard(
      dashboardId,
      validatedData as Parameters<typeof dashboardsService.updateDashboard>[1]
    );

    // Calculate changes for audit trail
    const changes = calculateChanges(
      {
        dashboard_name: before.dashboard_name,
        dashboard_description: before.dashboard_description,
        is_active: before.is_active,
        chart_ids: before.charts.map(c => c.chart_definition_id),
      },
      {
        dashboard_name: updatedDashboard.dashboard_name,
        dashboard_description: updatedDashboard.dashboard_description,
        is_active: updatedDashboard.is_active,
        chart_ids: updatedDashboard.charts.map(c => c.chart_definition_id),
      }
    );

    const template = logTemplates.crud.update('dashboard', {
      resourceId: dashboardId,
      resourceName: updatedDashboard.dashboard_name,
      userId: userContext.user_id,
      changes,
      duration: Date.now() - startTime,
      metadata: {
        chartCount: updatedDashboard.charts.length,
        isActive: updatedDashboard.is_active,
      },
    });
    log.info(template.message, template.context);

    // Targeted cache invalidation with error handling
    // Only invalidate what changed:
    // 1. This specific dashboard (metadata, chart associations)
    // 2. Dashboard list (for sidebar, dashboard list page)
    // 3. Chart definitions - ALWAYS invalidate if chart_ids changed (per requirement)
    // 4. Chart data remains valid (data hasn't changed, only dashboard metadata/layout)
    //
    // IMPORTANT: Cache failures should NOT rollback successful database writes.
    // Stale cache is better than lost data. Caches have TTLs that will eventually expire.
    try {
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

      log.info('Dashboard cache invalidated successfully', {
        dashboardId,
        invalidated: validatedData.chart_ids
          ? ['dashboard-specific', 'dashboard-list', 'chart-definitions']
          : ['dashboard-specific', 'dashboard-list'],
        preserved: ['chart-data'],
      });
    } catch (cacheError) {
      // Cache invalidation failure should NOT fail the request
      // Database update succeeded, cache will expire naturally (TTL)
      log.error('Cache invalidation failed after dashboard update - continuing with stale cache', cacheError as Error, {
        dashboardId,
        operation: 'dashboard_update_cache_invalidation',
        cacheWillExpire: true,
        dataIntegrityIntact: true,
      });
      // Don't throw - return success because database update succeeded
    }

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

    const template = logTemplates.crud.delete('dashboard', {
      resourceId: dashboardId,
      resourceName: dashboard.dashboard_name,
      userId: userContext.user_id,
      soft: false,
      duration: Date.now() - startTime,
      metadata: {
        wasActive: dashboard.is_active,
        hadCharts: dashboard.charts.length,
      },
    });
    log.info(template.message, template.context);

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
