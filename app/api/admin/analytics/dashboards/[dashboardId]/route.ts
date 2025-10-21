import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { analyticsCache } from '@/lib/cache/analytics-cache';
import { chartDataCache } from '@/lib/cache/chart-data-cache';
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

    // Aggressive cache invalidation - invalidate all related caches
    // Get dashboard with charts to invalidate their caches
    const fullDashboard = await dashboardsService.getDashboardById(dashboardId);

    if (fullDashboard?.charts) {
      // Invalidate each chart's definition cache
      for (const chart of fullDashboard.charts) {
        await analyticsCache.invalidate('chart', chart.chart_definition_id);
      }

      // Extract unique data source IDs from chart configs
      const dataSourceIds = new Set<number>();
      for (const chart of fullDashboard.charts) {
        // Chart configs are stored in the chart_config column of the chart definition
        // We need to get the full chart to access the config
        const chartDef = await analyticsCache.getChartDefinition(chart.chart_definition_id);
        if (chartDef?.chart_config) {
          const dataSourceId = (chartDef.chart_config as { dataSourceId?: number })?.dataSourceId;
          if (dataSourceId) {
            dataSourceIds.add(dataSourceId);
          }
        }
      }

      // Invalidate chart data cache for all data sources
      for (const dataSourceId of Array.from(dataSourceIds)) {
        await chartDataCache.invalidateByDataSource(dataSourceId);
      }

      log.info('Dashboard chart caches invalidated', {
        dashboardId,
        chartsInvalidated: fullDashboard.charts.length,
        dataSourcesInvalidated: dataSourceIds.size,
      });
    }

    // Invalidate dashboard-specific cache
    await analyticsCache.invalidate('dashboard', dashboardId);

    // Invalidate dashboard list cache
    await analyticsCache.invalidate('dashboard');

    // Invalidate chart list cache (charts may have been affected)
    await analyticsCache.invalidate('chart');

    log.info('All caches invalidated after dashboard update', {
      dashboardId,
      invalidated: ['dashboard', 'dashboard-list', 'chart-definitions', 'chart-data', 'chart-list'],
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

    // Aggressive cache invalidation - invalidate all related caches BEFORE deletion
    if (dashboard.charts) {
      // Invalidate each chart's definition cache
      for (const chart of dashboard.charts) {
        await analyticsCache.invalidate('chart', chart.chart_definition_id);
      }

      // Extract unique data source IDs from chart configs
      const dataSourceIds = new Set<number>();
      for (const chart of dashboard.charts) {
        // Chart configs are stored in the chart_config column of the chart definition
        // We need to get the full chart to access the config
        const chartDef = await analyticsCache.getChartDefinition(chart.chart_definition_id);
        if (chartDef?.chart_config) {
          const dataSourceId = (chartDef.chart_config as { dataSourceId?: number })?.dataSourceId;
          if (dataSourceId) {
            dataSourceIds.add(dataSourceId);
          }
        }
      }

      // Invalidate chart data cache for all data sources
      for (const dataSourceId of Array.from(dataSourceIds)) {
        await chartDataCache.invalidateByDataSource(dataSourceId);
      }

      log.info('Dashboard chart caches invalidated before deletion', {
        dashboardId,
        chartsInvalidated: dashboard.charts.length,
        dataSourcesInvalidated: dataSourceIds.size,
      });
    }

    // Delete dashboard through service with automatic permission checking
    await dashboardsService.deleteDashboard(dashboardId);

    log.db('DELETE', 'dashboards', Date.now() - startTime, { rowCount: 1 });

    log.info('Dashboard deleted successfully', {
      dashboardId,
      dashboardName: dashboard.dashboard_name,
      deletedBy: userContext.user_id,
    });

    // Invalidate dashboard-specific cache
    await analyticsCache.invalidate('dashboard', dashboardId);

    // Invalidate dashboard list cache
    await analyticsCache.invalidate('dashboard');

    // Invalidate chart list cache (charts may have been affected)
    await analyticsCache.invalidate('chart');

    log.info('All caches invalidated after dashboard deletion', {
      dashboardId,
      invalidated: ['dashboard', 'dashboard-list', 'chart-definitions', 'chart-data', 'chart-list'],
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
