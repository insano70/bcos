import { NextRequest } from 'next/server';
import { db, chart_definitions, chart_categories, users } from '@/lib/db';
import { eq, desc, and, isNull } from 'drizzle-orm';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { validateRequest } from '@/lib/api/middleware/validation';
import { chartDefinitionCreateSchema } from '@/lib/validations/analytics';
import type { UserContext } from '@/lib/types/rbac';
import { ChartDefinition } from '@/lib/types/analytics';
import { createAPILogger, logDBOperation, logPerformanceMetric, logSecurityEvent } from '@/lib/logger';

/**
 * Admin Analytics - Chart Definitions CRUD API
 * Manages chart definitions stored in the database
 */

// GET - List all chart definitions
const getChartsHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id);
  
  logger.info('Chart definitions list request initiated', {
    requestingUserId: userContext.user_id,
    isSuperAdmin: userContext.is_super_admin
  });

  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('category_id');
    const isActive = searchParams.get('is_active') !== 'false'; // Default to active only

    // Build query conditions
    const conditions = [
      isActive ? eq(chart_definitions.is_active, true) : undefined,
      categoryId ? eq(chart_definitions.chart_category_id, parseInt(categoryId)) : undefined
    ].filter(Boolean);

    // Fetch chart definitions with category and creator info
    const charts = await db
      .select()
      .from(chart_definitions)
      .leftJoin(chart_categories, eq(chart_definitions.chart_category_id, chart_categories.chart_category_id))
      .leftJoin(users, eq(chart_definitions.created_by, users.user_id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(chart_definitions.created_at));

    logDBOperation(logger, 'chart_definitions_list', 'chart_definitions', startTime, charts.length);

    logger.info('Chart definitions list completed successfully', {
      resultCount: charts.length,
      categoryFilter: categoryId,
      activeFilter: isActive,
      totalRequestTime: Date.now() - startTime
    });

    return createSuccessResponse({
      charts: charts,
      metadata: {
        total_count: charts.length,
        category_filter: categoryId,
        active_filter: isActive,
        generatedAt: new Date().toISOString()
      }
    }, 'Chart definitions retrieved successfully');
    
  } catch (error) {
    logger.error('Chart definitions list error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined,
      requestingUserId: userContext.user_id
    });
    
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? (error instanceof Error ? error.message : 'Unknown error')
      : 'Internal server error';
    
    logPerformanceMetric(logger, 'chart_definitions_list_failed', Date.now() - startTime);
    return createErrorResponse(errorMessage, 500, request);
  } finally {
    logPerformanceMetric(logger, 'chart_definitions_list_total', Date.now() - startTime);
  }
};

// POST - Create new chart definition
const createChartHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id);
  
  logger.info('Chart definition creation request initiated', {
    requestingUserId: userContext.user_id,
    isSuperAdmin: userContext.is_super_admin
  });

  try {
    // Validate request body with Zod
    const validatedData = await validateRequest(request, chartDefinitionCreateSchema);

    const [newChart] = await db
      .insert(chart_definitions)
      .values({
        chart_name: validatedData.chart_name,
        chart_description: validatedData.chart_description || null,
        chart_type: validatedData.chart_type,
        data_source: validatedData.data_source,
        chart_config: validatedData.chart_config || {},
        chart_category_id: validatedData.chart_category_id || null,
        created_by: userContext.user_id,
        is_active: validatedData.is_active
      })
      .returning();

    logDBOperation(logger, 'chart_definition_create', 'chart_definitions', startTime, 1);

    if (newChart) {
      logger.info('Chart definition created successfully', {
        chartId: newChart.chart_definition_id,
        chartName: newChart.chart_name,
        chartType: newChart.chart_type,
        createdBy: userContext.user_id,
        totalRequestTime: Date.now() - startTime
      });
    }

    return createSuccessResponse({
      chart: newChart
    }, 'Chart definition created successfully');
    
  } catch (error) {
    logger.error('Chart definition creation error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined,
      requestingUserId: userContext.user_id
    });
    
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? (error instanceof Error ? error.message : 'Unknown error')
      : 'Internal server error';
    
    logPerformanceMetric(logger, 'chart_definition_create_failed', Date.now() - startTime);
    return createErrorResponse(errorMessage, 500, request);
  } finally {
    logPerformanceMetric(logger, 'chart_definition_create_total', Date.now() - startTime);
  }
};

// Route handlers
export const GET = rbacRoute(getChartsHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api'
});

export const POST = rbacRoute(createChartHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api'
});
