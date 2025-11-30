import type { NextRequest } from 'next/server';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { publicRoute } from '@/lib/api/route-handlers';
import { log } from '@/lib/logger';
import { getDefaultDashboardId } from '@/lib/services/default-dashboard-service';

/**
 * Get Default Dashboard
 * Public endpoint - Returns the default dashboard ID if one is set
 * Used by login flow to redirect users to the default dashboard
 */
const getDefaultDashboardHandler = async (request: NextRequest) => {
  const startTime = Date.now();

  log.info('Default dashboard query initiated', {
    operation: 'get_default_dashboard',
    component: 'analytics',
  });

  try {
    // Use centralized service to get default dashboard ID
    const defaultDashboardId = await getDefaultDashboardId();

    log.db('SELECT', 'dashboards', Date.now() - startTime, {
      rowCount: defaultDashboardId ? 1 : 0,
    });

    if (!defaultDashboardId) {
      log.info('No default dashboard configured', {
        operation: 'get_default_dashboard',
        component: 'analytics',
      });
      return createSuccessResponse({ defaultDashboard: null }, 'No default dashboard configured');
    }

    log.info('Default dashboard found', {
      dashboardId: defaultDashboardId,
      operation: 'get_default_dashboard',
      component: 'analytics',
    });

    return createSuccessResponse(
      {
        defaultDashboard: {
          dashboard_id: defaultDashboardId,
        },
      },
      'Default dashboard retrieved successfully'
    );
  } catch (error) {
    log.error('Default dashboard query error', error, {
      operation: 'get_default_dashboard',
      component: 'analytics',
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

// Export as public route (no authentication required)
// This is needed so login page can determine redirect destination
export const GET = publicRoute(
  getDefaultDashboardHandler,
  'Public endpoint for default dashboard lookup',
  { rateLimit: 'api' }
);
