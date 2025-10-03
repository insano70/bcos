import { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { validateRequest } from '@/lib/api/middleware/validation';
import { dashboardCreateSchema, dashboardUpdateSchema } from '@/lib/validations/analytics';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';
import { createRBACDashboardsService } from '@/lib/services/rbac-dashboards-service';

/**
 * Admin Analytics - Dashboards CRUD API
 * Manages multi-chart dashboard compositions
 */

// GET - List all dashboards
const getDashboardsHandler = async (request: NextRequest, userContext: UserContext) => {
  log.info('Dashboards list request initiated', {
    requestingUserId: userContext.user_id,
    isSuperAdmin: userContext.is_super_admin
  });

  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('category_id');
    const isActive = searchParams.get('is_active') !== 'false';
    const isPublished = searchParams.get('is_published') === 'true' ? true : 
                       searchParams.get('is_published') === 'false' ? false : undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined;

    // Create service instance
    const dashboardsService = createRBACDashboardsService(userContext);

    // Get dashboards using service
    const dashboards = await dashboardsService.getDashboards({
      category_id: categoryId || undefined,
      is_active: isActive,
      is_published: isPublished,
      limit,
      offset
    });

    // Get total count for pagination
    const totalCount = await dashboardsService.getDashboardCount({
      category_id: categoryId || undefined,
      is_active: isActive,
      is_published: isPublished
    });

    return createSuccessResponse({
      dashboards,
      metadata: {
        total_count: totalCount,
        category_filter: categoryId,
        active_filter: isActive,
        generatedAt: new Date().toISOString()
      }
    }, 'Dashboards retrieved successfully');

  } catch (error) {
    log.error('Dashboards list error', error, {
      requestingUserId: userContext.user_id
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500,
      request
    );
  }
};

// POST - Create new dashboard
const createDashboardHandler = async (request: NextRequest, userContext: UserContext) => {
  log.info('Dashboard creation request initiated', {
    requestingUserId: userContext.user_id
  });

  try {
    // Validate request body with Zod
    const validatedData = await validateRequest(request, dashboardCreateSchema);

    // Create service instance
    const dashboardsService = createRBACDashboardsService(userContext);

    // Create dashboard using service
    const createdDashboard = await dashboardsService.createDashboard({
      dashboard_name: validatedData.dashboard_name,
      dashboard_description: validatedData.dashboard_description,
      dashboard_category_id: validatedData.dashboard_category_id,
      chart_ids: validatedData.chart_ids,
      chart_positions: validatedData.chart_positions,
      layout_config: validatedData.layout_config,
      is_active: validatedData.is_active,
      is_published: validatedData.is_published
    });

    log.info('Dashboard created successfully', {
      dashboardId: createdDashboard.dashboard_id,
      dashboardName: createdDashboard.dashboard_name,
      chartCount: createdDashboard.chart_count,
      createdBy: userContext.user_id
    });

    return createSuccessResponse({
      dashboard: createdDashboard
    }, 'Dashboard created successfully');

  } catch (error) {
    log.error('Dashboard creation error', error, {
      requestingUserId: userContext.user_id
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500,
      request
    );
  }
};

// Route handlers
export const GET = rbacRoute(getDashboardsHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api'
});

export const POST = rbacRoute(createDashboardHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api'
});
