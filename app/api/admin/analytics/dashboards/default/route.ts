import { NextRequest } from 'next/server';
import { db, dashboards } from '@/lib/db';
import { and, eq } from 'drizzle-orm';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { publicRoute } from '@/lib/api/route-handler';
import { log } from '@/lib/logger';

/**
 * Get Default Dashboard
 * Public endpoint - Returns the default dashboard ID if one is set
 * Used by login flow to redirect users to the default dashboard
 */
const getDefaultDashboardHandler = async (request: NextRequest) => {
  const startTime = Date.now();

  log.info('Default dashboard query initiated');

  try {
    // Query for the default dashboard (must be published, active, and marked as default)
    const [defaultDashboard] = await db
      .select({
        dashboard_id: dashboards.dashboard_id,
        dashboard_name: dashboards.dashboard_name,
      })
      .from(dashboards)
      .where(
        and(
          eq(dashboards.is_default, true),
          eq(dashboards.is_published, true),
          eq(dashboards.is_active, true)
        )
      )
      .limit(1);

    log.db('SELECT', 'dashboards', Date.now() - startTime, {
      rowCount: defaultDashboard ? 1 : 0,
    });

    if (!defaultDashboard) {
      log.info('No default dashboard configured');
      return createSuccessResponse(
        { defaultDashboard: null },
        'No default dashboard configured'
      );
    }

    log.info('Default dashboard found', {
      dashboardId: defaultDashboard.dashboard_id,
      dashboardName: defaultDashboard.dashboard_name,
    });

    return createSuccessResponse(
      {
        defaultDashboard: {
          dashboard_id: defaultDashboard.dashboard_id,
          dashboard_name: defaultDashboard.dashboard_name,
        },
      },
      'Default dashboard retrieved successfully'
    );
  } catch (error) {
    log.error('Default dashboard query error', error);

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
