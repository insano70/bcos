import { NextRequest } from 'next/server';
import { db, dashboards, dashboard_charts, chart_definitions, chart_categories, users } from '@/lib/db';
import { eq, desc, and, isNull, count } from 'drizzle-orm';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import type { UserContext } from '@/lib/types/rbac';
import { createAPILogger, logDBOperation, logPerformanceMetric } from '@/lib/logger';

/**
 * Admin Analytics - Dashboards CRUD API
 * Manages multi-chart dashboard compositions
 */

// GET - List all dashboards
const getDashboardsHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id);
  
  logger.info('Dashboards list request initiated', {
    requestingUserId: userContext.user_id,
    isSuperAdmin: userContext.is_super_admin
  });

  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('category_id');
    const isActive = searchParams.get('is_active') !== 'false';

    // Build query conditions
    const conditions = [
      isActive ? eq(dashboards.is_active, true) : undefined,
      categoryId ? eq(dashboards.dashboard_category_id, parseInt(categoryId)) : undefined
    ].filter(Boolean);

    // Fetch dashboards with creator and category info
    const dashboardList = await db
      .select({
        dashboard_id: dashboards.dashboard_id,
        dashboard_name: dashboards.dashboard_name,
        dashboard_description: dashboards.dashboard_description,
        layout_config: dashboards.layout_config,
        dashboard_category_id: dashboards.dashboard_category_id,
        category_name: chart_categories.category_name,
        created_by: dashboards.created_by,
        creator_name: users.first_name,
        creator_last_name: users.last_name,
        created_at: dashboards.created_at,
        updated_at: dashboards.updated_at,
        is_active: dashboards.is_active,
      })
      .from(dashboards)
      .leftJoin(chart_categories, eq(dashboards.dashboard_category_id, chart_categories.chart_category_id))
      .leftJoin(users, eq(dashboards.created_by, users.user_id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(dashboards.created_at));

    // Get chart count for each dashboard
    const dashboardsWithChartCount = await Promise.all(
      dashboardList.map(async (dashboard) => {
        const [chartCount] = await db
          .select({ count: count() })
          .from(dashboard_charts)
          .where(eq(dashboard_charts.dashboard_id, dashboard.dashboard_id));

        return {
          ...dashboard,
          chart_count: chartCount?.count || 0
        };
      })
    );

    logDBOperation(logger, 'dashboards_list', 'dashboards', startTime, dashboardsWithChartCount.length);

    return createSuccessResponse({
      dashboards: dashboardsWithChartCount,
      metadata: {
        total_count: dashboardsWithChartCount.length,
        category_filter: categoryId,
        active_filter: isActive,
        generatedAt: new Date().toISOString()
      }
    }, 'Dashboards retrieved successfully');
    
  } catch (error) {
    logger.error('Dashboards list error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestingUserId: userContext.user_id
    });
    
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// POST - Create new dashboard
const createDashboardHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id);
  
  logger.info('Dashboard creation request initiated', {
    requestingUserId: userContext.user_id
  });

  try {
    const body = await request.json();
    
    // Validate required fields
    if (!body.dashboard_name || !body.layout_config) {
      return createErrorResponse('Missing required fields: dashboard_name, layout_config', 400);
    }

    // Create new dashboard
    const [newDashboard] = await db
      .insert(dashboards)
      .values({
        dashboard_name: body.dashboard_name,
        dashboard_description: body.dashboard_description,
        layout_config: body.layout_config,
        dashboard_category_id: body.dashboard_category_id,
        created_by: userContext.user_id,
      })
      .returning();

    // Add charts to dashboard if provided
    if (body.chart_ids && Array.isArray(body.chart_ids)) {
      const chartAssociations = body.chart_ids.map((chartId: string, index: number) => ({
        dashboard_id: newDashboard.dashboard_id,
        chart_definition_id: chartId,
        position_config: body.chart_positions?.[index] || { x: 0, y: index, w: 6, h: 4 }
      }));

      await db
        .insert(dashboard_charts)
        .values(chartAssociations);
    }

    logDBOperation(logger, 'dashboard_create', 'dashboards', startTime, 1);

    logger.info('Dashboard created successfully', {
      dashboardId: newDashboard.dashboard_id,
      dashboardName: newDashboard.dashboard_name,
      chartCount: body.chart_ids?.length || 0,
      createdBy: userContext.user_id
    });

    return createSuccessResponse({
      dashboard: newDashboard
    }, 'Dashboard created successfully');
    
  } catch (error) {
    logger.error('Dashboard creation error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestingUserId: userContext.user_id
    });
    
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
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
