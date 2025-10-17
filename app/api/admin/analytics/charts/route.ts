import type { NextRequest } from 'next/server';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log, logTemplates, sanitizeFilters } from '@/lib/logger';
import { createRBACChartsService } from '@/lib/services/rbac-charts-service';
import type { UserContext } from '@/lib/types/rbac';
import { chartDefinitionCreateSchema } from '@/lib/validations/analytics';

/**
 * Admin Analytics - Chart Definitions CRUD API
 * Manages chart definitions stored in the database
 */

// GET - List all chart definitions
const getChartsHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('category_id');
    const isActive = searchParams.get('is_active') !== 'false'; // Default to active only

    // Create service instance and get charts
    const chartsService = createRBACChartsService(userContext);
    const charts = await chartsService.getCharts({
      category_id: categoryId || undefined,
      is_active: isActive,
    });

    const totalCount = await chartsService.getChartCount({
      category_id: categoryId || undefined,
      is_active: isActive,
    });

    // Prepare sanitized filter context
    const filters = sanitizeFilters({
      category_id: categoryId,
      is_active: isActive,
    });

    // Count charts by type
    const chartTypeCounts = charts.reduce(
      (acc, chart) => {
        const type = chart.chart_type || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Enriched success log with analytics-specific metrics
    log.info(`charts list query completed - returned ${charts.length} of ${totalCount}`, {
      operation: 'list_charts',
      resourceType: 'chart_definitions',
      userId: userContext.user_id,
      ...(userContext.current_organization_id && {
        organizationId: userContext.current_organization_id,
      }),
      filters,
      filterCount: Object.values(filters).filter((v) => v !== null && v !== undefined).length,
      results: {
        returned: charts.length,
        total: totalCount,
        chartTypeBreakdown: chartTypeCounts,
        activeCount: charts.filter((c) => c.is_active).length,
        inactiveCount: charts.filter((c) => !c.is_active).length,
      },
      duration: Date.now() - startTime,
      slow: Date.now() - startTime > 1000,
      component: 'analytics',
    });

    return createSuccessResponse(
      {
        charts: charts,
        metadata: {
          total_count: totalCount,
          category_filter: categoryId,
          active_filter: isActive,
          generatedAt: new Date().toISOString(),
        },
      },
      'Chart definitions retrieved successfully'
    );
  } catch (error) {
    log.error('Charts list query failed', error, {
      operation: 'list_charts',
      userId: userContext.user_id,
      duration: Date.now() - startTime,
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

// POST - Create new chart definition
const createChartHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    // Parse and validate request body with Zod
    const requestBody = await request.json();
    const validationResult = chartDefinitionCreateSchema.safeParse(requestBody);

    if (!validationResult.success) {
      const errorDetails = validationResult.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');

      log.error('Chart definition validation failed', new Error('Validation error'), {
        operation: 'create_chart',
        userId: userContext.user_id,
        validationErrors: validationResult.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
        component: 'analytics',
      });

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
      is_active: validatedData.is_active,
    });

    // Enriched creation success log using template
    const template = logTemplates.crud.create('chart_definition', {
      resourceId: createdChart.chart_definition_id,
      resourceName: createdChart.chart_name,
      userId: userContext.user_id,
      ...(userContext.current_organization_id && {
        organizationId: userContext.current_organization_id,
      }),
      duration: Date.now() - startTime,
      metadata: {
        chartType: createdChart.chart_type,
        dataSource: createdChart.data_source,
        categoryId: createdChart.chart_category_id,
        isActive: createdChart.is_active,
        hasDescription: !!createdChart.chart_description,
        configKeys: Object.keys(createdChart.chart_config || {}),
        createdBy: userContext.user_id,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse(
      {
        chart: createdChart,
      },
      'Chart definition created successfully'
    );
  } catch (error) {
    log.error('Chart definition creation failed', error, {
      operation: 'create_chart',
      userId: userContext.user_id,
      duration: Date.now() - startTime,
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

// Route handlers
export const GET = rbacRoute(getChartsHandler, {
  permission: ['analytics:read:all', 'analytics:read:organization', 'analytics:read:own'],
  rateLimit: 'api',
});

export const POST = rbacRoute(createChartHandler, {
  permission: ['charts:create:organization', 'charts:create:own', 'analytics:read:all'],
  rateLimit: 'api',
});
