import { NextRequest } from 'next/server';
import { db, dashboards, dashboard_charts, chart_definitions, chart_categories, users } from '@/lib/db';
import { eq, desc, and, isNull, count } from 'drizzle-orm';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { validateRequest } from '@/lib/api/middleware/validation';
import { dashboardCreateSchema } from '@/lib/validations/analytics';
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
      .select()
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
          .where(eq(dashboard_charts.dashboard_id, dashboard.dashboards.dashboard_id));

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
      stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined,
      requestingUserId: userContext.user_id
    });
    
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? (error instanceof Error ? error.message : 'Unknown error')
      : 'Internal server error';
    
    return createErrorResponse(errorMessage, 500, request);
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
    // Validate request body with Zod
    const validatedData = await validateRequest(request, dashboardCreateSchema);

    // Create new dashboard
    const [newDashboard] = await db
      .insert(dashboards)
      .values({
        dashboard_name: validatedData.dashboard_name,
        dashboard_description: validatedData.dashboard_description,
        layout_config: validatedData.layout_config || {},
        dashboard_category_id: validatedData.dashboard_category_id,
        created_by: userContext.user_id,
        is_active: validatedData.is_active
      })
      .returning();

    if (!newDashboard) {
      return createErrorResponse('Failed to create dashboard', 500, request);
    }

    // Add charts to dashboard if provided
    if (validatedData.chart_ids && Array.isArray(validatedData.chart_ids)) {
      const chartAssociations = validatedData.chart_ids.map((chartId: string, index: number) => ({
        dashboard_id: newDashboard.dashboard_id,
        chart_definition_id: chartId,
        position_config: { x: 0, y: index, w: 6, h: 4 } // Default layout
      }));

      await db
        .insert(dashboard_charts)
        .values(chartAssociations);
    }

    logDBOperation(logger, 'dashboard_create', 'dashboards', startTime, 1);

    logger.info('Dashboard created successfully', {
      dashboardId: newDashboard.dashboard_id,
      dashboardName: newDashboard.dashboard_name,
      chartCount: validatedData.chart_ids?.length || 0,
      createdBy: userContext.user_id
    });

    return createSuccessResponse({
      dashboard: newDashboard
    }, 'Dashboard created successfully');
    
  } catch (error) {
    logger.error('Dashboard creation error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined,
      requestingUserId: userContext.user_id
    });
    
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? (error instanceof Error ? error.message : 'Unknown error')
      : 'Internal server error';
    
    return createErrorResponse(errorMessage, 500, request);
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
