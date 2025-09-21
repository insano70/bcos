import { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
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
 * Admin Analytics - Measures Data
 * Provides comprehensive measures analytics from ih.gr_app_measures table
 */
const analyticsHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id);
  let queryParams: AnalyticsQueryParams | undefined;
  
  logger.info('Measures analytics request initiated', {
    requestingUserId: userContext.user_id,
    isSuperAdmin: userContext.is_super_admin
  });

  try {

    // Health check for analytics database
    const healthStart = Date.now();
    const healthCheck = await checkAnalyticsDbHealth();
    logPerformanceMetric(logger, 'analytics_db_health_check', Date.now() - healthStart);
    
    if (!healthCheck.isHealthy) {
      logger.error('Analytics database health check failed', { error: healthCheck.error });
      
      // Provide helpful error message for configuration issues
      if (healthCheck.error?.includes('not configured')) {
        return createErrorResponse('Analytics database not configured. Please set ANALYTICS_DATABASE_URL in your environment.', 503);
      }
      
      return createErrorResponse('Analytics database unavailable', 503);
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    
    const practiceUidParam = searchParams.get('practice_uid');
    // Parse advanced filters from query parameters
    const advancedFiltersParam = searchParams.get('advanced_filters');
    let advancedFilters;
    if (advancedFiltersParam) {
      try {
        advancedFilters = JSON.parse(decodeURIComponent(advancedFiltersParam));
      } catch (error) {
        return createErrorResponse('Invalid advanced_filters parameter format', 400);
      }
    }

    // Parse calculated field parameter
    const calculatedField = searchParams.get('calculated_field') || undefined;

    // Parse multiple series configuration
    const multipleSeriesParam = searchParams.get('multiple_series');
    let multipleSeries;
    if (multipleSeriesParam) {
      try {
        multipleSeries = JSON.parse(decodeURIComponent(multipleSeriesParam));
      } catch (error) {
        return createErrorResponse('Invalid multiple_series parameter format', 400);
      }
    }

    const queryParams: AnalyticsQueryParams = {
      measure: searchParams.get('measure') as MeasureType || undefined,
      frequency: searchParams.get('frequency') as FrequencyType || undefined,
      practice: searchParams.get('practice') || undefined,
      practice_primary: searchParams.get('practice_primary') || undefined,
      practice_uid: practiceUidParam ? parseInt(practiceUidParam, 10) : undefined,
      provider_name: searchParams.get('provider_name') || undefined,
      start_date: searchParams.get('start_date') || undefined,
      end_date: searchParams.get('end_date') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined,
      advanced_filters: advancedFilters,
      calculated_field: calculatedField,
      multiple_series: multipleSeries,
    };

    console.log('🔍 PARSED QUERY PARAMS:', {
      queryParams,
      rawPracticeUid: practiceUidParam,
      parsedPracticeUid: queryParams.practice_uid
    });

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

    logger.debug('Analytics query parameters parsed', queryParams as Record<string, unknown>);

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

    const analytics = {
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
        analytics_db_latency_ms: healthCheck.latency,
        generatedAt: new Date().toISOString()
      }
    };

    return createSuccessResponse(analytics, 'Measures analytics retrieved successfully');
    
  } catch (error) {
    logger.error('Measures analytics error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      queryParams,
      requestingUserId: userContext.user_id
    });
    
    logPerformanceMetric(logger, 'analytics_request_failed', Date.now() - startTime);
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  } finally {
    logPerformanceMetric(logger, 'measures_analytics_total', Date.now() - startTime);
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
// Uses analytics:read:all permission (granted via roles)
// Super admins bypass permission checks automatically
export const GET = rbacRoute(
  analyticsHandler,
  {
    permission: 'analytics:read:all',
    rateLimit: 'api'
  }
);

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
