import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/route-handlers';
import type { UserContext } from '@/lib/types/rbac';
import type { ChartData } from '@/lib/types/analytics';
import { log } from '@/lib/logger';
import { chartDataOrchestrator } from '@/lib/services/chart-data-orchestrator';
import { buildCacheControlHeader } from '@/lib/constants/analytics';
import { chartDataCache } from '@/lib/cache/chart-data-cache';
import { generateCacheKey } from '@/lib/utils/cache-key-generator';

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

/**
 * Column definition for table charts
 */
interface ColumnDefinition {
  columnName: string;
  displayName: string;
  dataType: string;
  formatType?: string | null;
  displayIcon?: boolean | null;
  iconType?: string | null;
  iconColorMode?: string | null;
  iconColor?: string | null;
  iconMapping?: Record<string, unknown> | null;
}

/**
 * Formatted cell for table charts (Phase 3.2)
 */
interface FormattedCell {
  formatted: string; // Display value (e.g., "$1,000.00")
  raw: unknown; // Original value for sorting/exporting
  icon?: {
    name: string;
    color?: string;
    type?: string;
  };
}

/**
 * Unified response format for all chart types
 */
interface UniversalChartDataResponse {
  chartData: ChartData; // Transformed Chart.js format
  rawData: Record<string, unknown>[]; // Original data for exports
  columns?: ColumnDefinition[]; // Optional: Column metadata for table charts
  formattedData?: Array<Record<string, FormattedCell>>; // Optional: Formatted table data (Phase 3.2)
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
 *
 * @param request - Next.js request object containing chart data request
 * @param userContext - Authenticated user context from RBAC middleware
 * @returns Response with transformed chart data or error
 *
 * @throws {ValidationError} If request body fails schema validation
 * @throws {NotFoundError} If chart definition or data source not found
 * @throws {APIError} If user lacks access to requested data source or other errors
 */
const universalChartDataHandler = async (
  request: NextRequest,
  userContext: UserContext
): Promise<Response> => {
  const startTime = Date.now();

  // Extract client IP for security monitoring
  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  log.info('Universal chart data request initiated', {
    requestingUserId: userContext.user_id,
    currentOrganizationId: userContext.current_organization_id,
    ipAddress: clientIp,
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

    const validatedData = validationResult.data;

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

    // 2. Check cache before fetching (Phase 6)
    const { searchParams } = new URL(request.url);
    const bypassCache = searchParams.get('nocache') === 'true';
    
    let cacheKey: string | null = null;
    let cachedData: Awaited<ReturnType<typeof chartDataCache.get>> = null;

    if (!bypassCache && validatedData.chartConfig) {
      // Merge chartConfig with runtimeFilters for cache key
      const configForCache = {
        ...validatedData.chartConfig,
        ...validatedData.runtimeFilters,
      };
      
      cacheKey = generateCacheKey(configForCache);
      cachedData = await chartDataCache.get(cacheKey);
      
      if (cachedData) {
        log.info('Chart data served from cache', {
          requestingUserId: userContext.user_id,
          chartType: cachedData.metadata.chartType,
          cacheKey,
          cachedAt: cachedData.metadata.cachedAt,
        });
        
        // Return cached data immediately
        const cachedResponse = {
          ...cachedData,
          metadata: {
            ...cachedData.metadata,
            cacheHit: true,
            transformedAt: new Date().toISOString(),
            transformDuration: 0, // Cached, no transformation time
          },
        };
        
        const successResponse = createSuccessResponse(cachedResponse, 'Chart data fetched from cache');
        successResponse.headers.set('Cache-Control', buildCacheControlHeader());
        successResponse.headers.set('X-Cache-Hit', 'true');
        successResponse.headers.set('X-Chart-Type', cachedData.metadata.chartType);
        
        return successResponse;
      }
    }

    // 3. Orchestrate chart data fetching and transformation (cache miss)
    const orchestratorStartTime = Date.now();

    const result = await chartDataOrchestrator.orchestrate(validatedData, userContext);

    const orchestratorDuration = Date.now() - orchestratorStartTime;
    
    // 4. Set cache after successful orchestration (Phase 6)
    if (cacheKey && result) {
      await chartDataCache.set(cacheKey, {
        chartData: result.chartData,
        rawData: result.rawData,
        metadata: {
          chartType: result.metadata.chartType,
          dataSourceId: result.metadata.dataSourceId,
          queryTimeMs: result.metadata.queryTimeMs,
          recordCount: result.metadata.recordCount,
          cachedAt: new Date().toISOString(),
        },
      });
    }

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
      ...(result.columns && { columns: result.columns }), // Include columns if present (table charts)
      ...(result.formattedData && { formattedData: result.formattedData }), // Include formatted data if present (Phase 3.2)
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

    // Add caching headers (using centralized constants)
    successResponse.headers.set('Cache-Control', buildCacheControlHeader());
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

    // Determine appropriate HTTP status code based on error type
    let statusCode = 500;
    if (error instanceof Error) {
      // Check error message for common patterns
      if (error.message.includes('not found')) {
        statusCode = 404;
      } else if (error.message.includes('validation') || error.message.includes('invalid')) {
        statusCode = 400;
      } else if (error.message.includes('permission') || error.message.includes('access denied')) {
        statusCode = 403;
      }
    }

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to fetch chart data',
      statusCode,
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
