import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log, logTemplates, sanitizeFilters, SLOW_THRESHOLDS } from '@/lib/logger';
import { createRBACDashboardsService } from '@/lib/services/dashboards';
import type { UserContext } from '@/lib/types/rbac';
import { dashboardCreateSchema } from '@/lib/validations/analytics';

/**
 * Admin Analytics - Dashboards CRUD API
 * Manages multi-chart dashboard compositions
 */

// GET - List all dashboards
const getDashboardsHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('category_id');
    const isActive = searchParams.get('is_active') !== 'false';
    const isPublished =
      searchParams.get('is_published') === 'true'
        ? true
        : searchParams.get('is_published') === 'false'
          ? false
          : undefined;
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;
    const offsetParam = searchParams.get('offset');
    const offset = offsetParam ? parseInt(offsetParam, 10) : undefined;

    // Create service instance
    const dashboardsService = createRBACDashboardsService(userContext);

    // Get dashboards using service
    const dashboards = await dashboardsService.getDashboards({
      category_id: categoryId || undefined,
      is_active: isActive,
      is_published: isPublished,
      limit,
      offset,
    });

    // Get total count for pagination
    const totalCount = await dashboardsService.getDashboardCount({
      category_id: categoryId || undefined,
      is_active: isActive,
      is_published: isPublished,
    });

    // Prepare sanitized filter context
    const filters = sanitizeFilters({
      category_id: categoryId,
      is_active: isActive,
      is_published: isPublished,
    });

    // Calculate dashboard statistics
    const publishedCount = dashboards.filter((d) => d.is_published).length;
    const draftCount = dashboards.filter((d) => !d.is_published).length;
    const defaultDashboard = dashboards.find((d) => d.is_default);
    const totalCharts = dashboards.reduce((sum, d) => sum + (d.chart_count || 0), 0);

    // Enriched success log with dashboard-specific metrics
    log.info(`dashboards list query completed - returned ${dashboards.length} of ${totalCount}`, {
      operation: 'list_dashboards',
      resourceType: 'dashboards',
      userId: userContext.user_id,
      ...(userContext.current_organization_id && {
        organizationId: userContext.current_organization_id,
      }),
      filters,
      filterCount: Object.values(filters).filter((v) => v !== null && v !== undefined).length,
      results: {
        returned: dashboards.length,
        total: totalCount,
        published: publishedCount,
        draft: draftCount,
        hasDefault: !!defaultDashboard,
        ...(defaultDashboard && { defaultDashboardId: defaultDashboard.dashboard_id }),
        totalCharts,
        averageChartsPerDashboard:
          dashboards.length > 0 ? Math.round(totalCharts / dashboards.length) : 0,
        page: offset && limit ? Math.floor(offset / limit) + 1 : 1,
        pageSize: limit || totalCount,
      },
      duration: Date.now() - startTime,
      slow: Date.now() - startTime > SLOW_THRESHOLDS.API_OPERATION,
      component: 'analytics',
    });

    return createSuccessResponse(
      {
        dashboards,
        metadata: {
          total_count: totalCount,
          category_filter: categoryId,
          active_filter: isActive,
          generatedAt: new Date().toISOString(),
        },
      },
      'Dashboards retrieved successfully'
    );
  } catch (error) {
    log.error('Dashboards list query failed', error, {
      operation: 'list_dashboards',
      userId: userContext.user_id,
      duration: Date.now() - startTime,
      component: 'analytics',
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
  const startTime = Date.now();

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
      is_published: validatedData.is_published,
      is_default: validatedData.is_default,
    });

    // Enriched creation success log using template
    const template = logTemplates.crud.create('dashboard', {
      resourceId: createdDashboard.dashboard_id,
      resourceName: createdDashboard.dashboard_name,
      userId: userContext.user_id,
      ...(userContext.current_organization_id && {
        organizationId: userContext.current_organization_id,
      }),
      duration: Date.now() - startTime,
      metadata: {
        chartCount: createdDashboard.chart_count || 0,
        categoryId: createdDashboard.dashboard_category_id,
        isActive: createdDashboard.is_active,
        isPublished: createdDashboard.is_published,
        isDefault: createdDashboard.is_default,
        hasDescription: !!createdDashboard.dashboard_description,
        hasLayoutConfig: !!validatedData.layout_config,
        hasChartPositions: !!validatedData.chart_positions,
        createdBy: userContext.user_id,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse(
      {
        dashboard: createdDashboard,
      },
      'Dashboard created successfully'
    );
  } catch (error) {
    log.error('Dashboard creation failed', error, {
      operation: 'create_dashboard',
      userId: userContext.user_id,
      duration: Date.now() - startTime,
      component: 'analytics',
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
  permission: ['analytics:read:all', 'analytics:read:organization', 'analytics:read:own'],
  rateLimit: 'api',
});

export const POST = rbacRoute(createDashboardHandler, {
  permission: ['dashboards:create:organization', 'dashboards:create:own', 'analytics:read:all'],
  rateLimit: 'api',
});
