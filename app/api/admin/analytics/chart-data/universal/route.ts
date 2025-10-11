import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import type { UserContext } from '@/lib/types/rbac';
import type { ChartData } from '@/lib/types/analytics';
import { log } from '@/lib/logger';
import { chartDataOrchestrator } from '@/lib/services/chart-data-orchestrator';

/**
 * Universal Chart Data Endpoint
 * POST /api/admin/analytics/chart-data/universal
 *
 * Single unified endpoint for ALL chart types.
 * Replaces fragmented endpoints with pluggable handler system.
 *
 * Features:
 * - Supports all chart types (line, bar, table, number, dual-axis, etc.)
 * - Server-side data transformation for consistency
 * - Pluggable chart type handlers via registry
 * - Unified caching strategy
 * - Type-safe request validation
 *
 * @param request - Next.js request object
 * @param userContext - Authenticated user context from RBAC
 * @returns UniversalChartDataResponse with transformed chart data
 */

/**
 * Unified request schema for all chart types
 * Accepts either a chart definition ID or inline configuration
 */
const universalChartDataRequestSchema = z.object({
  // Option 1: Reference existing chart definition
  chartDefinitionId: z.string().uuid().optional(),

  // Option 2: Inline chart configuration
  chartConfig: z
    .object({
      chartType: z.enum([
        'line',
        'bar',
        'stacked-bar',
        'horizontal-bar',
        'progress-bar',
        'pie',
        'doughnut',
        'area',
        'table',
        'dual-axis',
        'number',
      ]),
      dataSourceId: z.number().positive(),
      groupBy: z.string().optional(),
      colorPalette: z.string().default('default'),
      stackingMode: z.enum(['normal', 'percentage']).optional(),
      responsive: z.boolean().default(false),
      minHeight: z.number().optional(),
      maxHeight: z.number().optional(),
    })
    .passthrough() // Allow chart-type-specific fields
    .optional(),

  // Runtime filters (override chart definition)
  runtimeFilters: z
    .object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      dateRangePreset: z.string().optional(),
      practice: z.string().optional(),
      practiceUid: z.string().optional(),
      providerName: z.string().optional(),
      measure: z.string().optional(),
      frequency: z.string().optional(),
    })
    .optional(),
});

type UniversalChartDataRequest = z.infer<typeof universalChartDataRequestSchema>;

/**
 * Unified response format for all chart types
 */
interface UniversalChartDataResponse {
  chartData: ChartData; // Transformed Chart.js format
  rawData: Record<string, unknown>[]; // Original data for exports
  metadata: {
    chartType: string;
    dataSourceId: number;
    transformedAt: string;
    queryTimeMs: number;
    cacheHit: boolean;
    recordCount: number;
    transformDuration: number;
  };
}

/**
 * Universal chart data handler
 * Routes requests to appropriate chart type handler via registry
 */
const universalChartDataHandler = async (
  request: NextRequest,
  userContext: UserContext
): Promise<Response> => {
  const startTime = Date.now();

  log.info('Universal chart data request initiated', {
    requestingUserId: userContext.user_id,
    currentOrganizationId: userContext.current_organization_id,
  });

  try {
    // 1. Parse and validate request body
    const requestBody = await request.json();

    const validationResult = universalChartDataRequestSchema.safeParse(requestBody);
    if (!validationResult.success) {
      const errorDetails = validationResult.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join(', ');

      log.error('Universal chart data validation failed', new Error('Validation error'), {
        requestingUserId: userContext.user_id,
        validationErrors: validationResult.error.issues,
      });

      return createErrorResponse(`Validation failed: ${errorDetails}`, 400, request);
    }

    const validatedData: UniversalChartDataRequest = validationResult.data;

    // Validate that either chartDefinitionId or chartConfig is provided
    if (!validatedData.chartDefinitionId && !validatedData.chartConfig) {
      return createErrorResponse(
        'Either chartDefinitionId or chartConfig must be provided',
        400,
        request
      );
    }

    log.info('Universal chart data request validated', {
      requestingUserId: userContext.user_id,
      hasChartDefinitionId: Boolean(validatedData.chartDefinitionId),
      hasChartConfig: Boolean(validatedData.chartConfig),
      chartType: validatedData.chartConfig?.chartType,
      hasRuntimeFilters: Boolean(validatedData.runtimeFilters),
    });

    // 2. Orchestrate chart data fetching and transformation
    const orchestratorStartTime = Date.now();

    const result = await chartDataOrchestrator.orchestrate(validatedData, userContext);

    const orchestratorDuration = Date.now() - orchestratorStartTime;

    log.info('Chart data orchestration completed', {
      requestingUserId: userContext.user_id,
      chartType: result.metadata.chartType,
      recordCount: result.metadata.recordCount,
      orchestratorDuration,
      queryTimeMs: result.metadata.queryTimeMs,
      cacheHit: result.metadata.cacheHit,
    });

    // 3. Build unified response
    const response: UniversalChartDataResponse = {
      chartData: result.chartData,
      rawData: result.rawData,
      metadata: {
        chartType: result.metadata.chartType,
        dataSourceId: result.metadata.dataSourceId,
        transformedAt: new Date().toISOString(),
        queryTimeMs: result.metadata.queryTimeMs,
        cacheHit: result.metadata.cacheHit,
        recordCount: result.metadata.recordCount,
        transformDuration: Date.now() - startTime,
      },
    };

    const duration = Date.now() - startTime;

    log.info('Universal chart data request completed successfully', {
      requestingUserId: userContext.user_id,
      chartType: result.metadata.chartType,
      duration,
      recordCount: result.metadata.recordCount,
      cacheHit: result.metadata.cacheHit,
    });

    // 4. Return with caching headers
    const successResponse = createSuccessResponse(response, 'Chart data fetched successfully');

    // Add caching headers
    successResponse.headers.set(
      'Cache-Control',
      'private, max-age=300, stale-while-revalidate=60'
    );
    successResponse.headers.set('X-Chart-Type', result.metadata.chartType);
    successResponse.headers.set('X-Transform-Duration', `${duration}ms`);
    successResponse.headers.set('X-Cache-Hit', result.metadata.cacheHit ? 'true' : 'false');

    return successResponse;
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Universal chart data request failed', error, {
      duration,
      requestingUserId: userContext.user_id,
      currentOrganizationId: userContext.current_organization_id,
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to fetch chart data',
      500,
      request
    );
  }
};

// Export as RBAC-protected route
export const POST = rbacRoute(universalChartDataHandler, {
  permission: ['analytics:read:organization', 'analytics:read:all'],
  rateLimit: 'api',
});

// Disable caching for this route - we handle caching internally
export const dynamic = 'force-dynamic';
export const revalidate = 0;
