import { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { applyRateLimit } from '@/lib/api/middleware/rate-limit';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { analyticsQueryBuilder } from '@/lib/services/analytics-query-builder';
import { checkAnalyticsDbHealth } from '@/lib/services/analytics-db';
import { 
  AnalyticsQueryParams, 
  MeasureType, 
  FrequencyType,
  ChartRenderContext 
} from '@/lib/types/analytics';
import type { UserContext } from '@/lib/types/rbac';
import { 
  createAPILogger, 
  logDBOperation, 
  logPerformanceMetric 
} from '@/lib/logger';

/**
 * Analytics Measures API
 * Secure endpoint for fetching data from ih.gr_app_measures table
 * Implements RBAC, rate limiting, and parameterized queries
 */

const analyticsHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id);
  
  logger.info('Analytics measures request initiated', {
    requestingUserId: userContext.user_id,
    organizationId: userContext.current_organization_id
  });

  try {
    // Apply rate limiting
    const rateLimitStart = Date.now();
    await applyRateLimit(request, 'api');
    logPerformanceMetric(logger, 'rate_limit_check', Date.now() - rateLimitStart);

    // Health check for analytics database
    const healthStart = Date.now();
    const healthCheck = await checkAnalyticsDbHealth();
    logPerformanceMetric(logger, 'analytics_db_health_check', Date.now() - healthStart);
    
    if (!healthCheck.isHealthy) {
      logger.error('Analytics database health check failed', { error: healthCheck.error });
      return createErrorResponse('Analytics database unavailable', 503);
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    
    const queryParams: AnalyticsQueryParams = {
      measure: searchParams.get('measure') as MeasureType || undefined,
      frequency: searchParams.get('frequency') as FrequencyType || undefined,
      practice_uid: searchParams.get('practice_uid') || undefined,
      provider_uid: searchParams.get('provider_uid') || undefined,
      start_date: searchParams.get('start_date') || undefined,
      end_date: searchParams.get('end_date') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined,
    };

    // Validate query parameters
    if (queryParams.limit && (queryParams.limit < 1 || queryParams.limit > 10000)) {
      return createErrorResponse('Invalid limit parameter', 400);
    }

    if (queryParams.offset && queryParams.offset < 0) {
      return createErrorResponse('Invalid offset parameter', 400);
    }

    // Validate date parameters
    if (queryParams.start_date && !isValidDate(queryParams.start_date)) {
      return createErrorResponse('Invalid start_date format', 400);
    }

    if (queryParams.end_date && !isValidDate(queryParams.end_date)) {
      return createErrorResponse('Invalid end_date format', 400);
    }

    logger.debug('Analytics query parameters parsed', queryParams);

    // Build chart render context from user context
    // TODO: This should be enhanced with actual user permissions
    // For now, we'll allow access to all practices/providers for admin users
    const chartContext: ChartRenderContext = {
      user_id: userContext.user_id,
      accessible_practices: [], // Empty means all practices accessible (for now)
      accessible_providers: [], // Empty means all providers accessible (for now)
      roles: userContext.roles?.map(role => role.name) || []
    };

    // Execute analytics query
    const queryStart = Date.now();
    const result = await analyticsQueryBuilder.queryMeasures(queryParams, chartContext);
    logPerformanceMetric(logger, 'analytics_query_execution', Date.now() - queryStart);

    // Log successful operation
    logDBOperation(logger, 'analytics_measures_query', 'ih.gr_app_measures', startTime, result.data.length);

    logger.info('Analytics measures request completed successfully', {
      resultCount: result.data.length,
      totalCount: result.total_count,
      queryTimeMs: result.query_time_ms,
      totalRequestTime: Date.now() - startTime
    });

    return createSuccessResponse({
      measures: result.data,
      pagination: {
        total_count: result.total_count,
        limit: queryParams.limit || 1000,
        offset: queryParams.offset || 0,
        has_more: (queryParams.offset || 0) + result.data.length < result.total_count
      },
      metadata: {
        query_time_ms: result.query_time_ms,
        cache_hit: result.cache_hit || false,
        analytics_db_latency_ms: healthCheck.latency
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Analytics measures request failed', { 
      error: errorMessage,
      totalRequestTime: Date.now() - startTime
    });

    // Don't expose internal error details to client
    return createErrorResponse('Failed to fetch analytics data', 500);
  }
};

/**
 * Validate date string format (YYYY-MM-DD)
 */
function isValidDate(dateString: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * GET /api/analytics/measures
 * Fetch measures data with filtering and pagination
 * 
 * Query Parameters:
 * - measure: Filter by measure type (e.g., "Charges by Practice")
 * - frequency: Filter by frequency (Monthly, Weekly, Quarterly)
 * - practice_uid: Filter by specific practice
 * - provider_uid: Filter by specific provider
 * - start_date: Filter by period start date (YYYY-MM-DD)
 * - end_date: Filter by period end date (YYYY-MM-DD)
 * - limit: Number of records to return (1-10000, default 1000)
 * - offset: Number of records to skip (default 0)
 */
export const GET = rbacRoute(analyticsHandler, {
  permission: 'analytics:read:all',
  requireAuth: true,
  rateLimit: 'api'
});

/**
 * Health check endpoint for analytics measures
 */
export async function HEAD(request: NextRequest) {
  try {
    const health = await checkAnalyticsDbHealth();
    
    if (health.isHealthy) {
      return new Response(null, { 
        status: 200,
        headers: {
          'X-Analytics-DB-Latency': health.latency?.toString() || '0'
        }
      });
    } else {
      return new Response(null, { status: 503 });
    }
  } catch (error) {
    return new Response(null, { status: 503 });
  }
}
