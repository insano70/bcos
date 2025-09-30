import { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { validateRequest } from '@/lib/api/middleware/validation';
import { chartDefinitionCreateSchema } from '@/lib/validations/analytics';
import type { UserContext } from '@/lib/types/rbac';
import { createAppLogger } from '@/lib/logger/factory';
import { createRBACChartsService } from '@/lib/services/rbac-charts-service';

/**
 * Admin Analytics - Chart Definitions CRUD API
 * Manages chart definitions stored in the database
 */

// GET - List all chart definitions
const getChartsHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();
  const logger = createAppLogger('admin-analytics').withUser(userContext.user_id, userContext.current_organization_id);

  logger.info('Chart definitions list request initiated', {
    requestingUserId: userContext.user_id,
    isSuperAdmin: userContext.is_super_admin
  });

  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('category_id');
    const isActive = searchParams.get('is_active') !== 'false'; // Default to active only

    // Create service instance and get charts
    const chartsService = createRBACChartsService(userContext);
    const charts = await chartsService.getCharts({
      category_id: categoryId || undefined,
      is_active: isActive,
      limit: 50 // Default limit, can be made configurable later
    });

    const totalCount = await chartsService.getChartCount({
      category_id: categoryId || undefined,
      is_active: isActive
    });

    logger.info('Chart definitions list completed successfully', {
      resultCount: charts.length,
      totalCount,
      categoryFilter: categoryId,
      activeFilter: isActive,
      totalRequestTime: Date.now() - startTime
    });

    return createSuccessResponse({
      charts: charts,
      metadata: {
        total_count: totalCount,
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

    return createErrorResponse(errorMessage, 500, request);
  }
};

// POST - Create new chart definition
const createChartHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();
  const logger = createAppLogger('admin-analytics').withUser(userContext.user_id, userContext.current_organization_id);

  logger.info('Chart definition creation request initiated', {
    requestingUserId: userContext.user_id,
    isSuperAdmin: userContext.is_super_admin
  });

  try {
    // Parse and log request body for debugging
    const requestBody = await request.json();
    console.log('📥 Received chart definition request:', JSON.stringify(requestBody, null, 2));
    
    // Validate request body with Zod
    const validationResult = chartDefinitionCreateSchema.safeParse(requestBody);
    
    if (!validationResult.success) {
      const errorDetails = validationResult.error.issues.map(issue => 
        `${issue.path.join('.')}: ${issue.message}`
      ).join(', ');
      console.error('❌ Validation failed:', JSON.stringify(validationResult.error.issues, null, 2));
      return createErrorResponse(`Validation failed: ${errorDetails}`, 400);
    }
    
    const validatedData = validationResult.data;

    // Create service instance and create chart
    const chartsService = createRBACChartsService(userContext);
    const createdChart = await chartsService.createChart({
      chart_name: validatedData.chart_name,
      chart_description: validatedData.chart_description,
      chart_type: validatedData.chart_type,
      data_source: validatedData.data_source,
      chart_config: validatedData.chart_config,
      chart_category_id: validatedData.chart_category_id ?? undefined,
      is_active: validatedData.is_active
    });

    logger.info('Chart definition created successfully', {
      chartId: createdChart.chart_definition_id,
      chartName: createdChart.chart_name,
      chartType: createdChart.chart_type,
      createdBy: userContext.user_id,
      totalRequestTime: Date.now() - startTime
    });

    return createSuccessResponse({
      chart: createdChart
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

    return createErrorResponse(errorMessage, 500, request);
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
