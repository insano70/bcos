import { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { executeAnalyticsQuery } from '@/lib/services/analytics-db';
import type { UserContext } from '@/lib/types/rbac';
import { createAPILogger, logDBOperation, logPerformanceMetric } from '@/lib/logger';

/**
 * Admin Analytics - Charges and Payments Chart
 * Specific endpoint for the Charges vs Payments chart using exact SQL
 */
const chargesPaymentsHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id);
  
  logger.info('Charges and Payments analytics request initiated', {
    requestingUserId: userContext.user_id,
    isSuperAdmin: userContext.is_super_admin
  });

  try {
    const { searchParams } = new URL(request.url);
    const practiceUidParam = searchParams.get('practice_uid') || '114';
    const practiceUid = parseInt(practiceUidParam, 10); // Convert to number

    // First, let's see what data exists for this practice
    const exploreQuery = `
      SELECT DISTINCT measure, frequency, COUNT(*) as count
      FROM ih.gr_app_measures 
      WHERE practice_uid = $1
      GROUP BY measure, frequency
      ORDER BY count DESC
    `;

    console.log('🔍 EXPLORING PRACTICE DATA:', { practiceUid, exploreQuery });
    const practiceData = await executeAnalyticsQuery(exploreQuery, [practiceUid]);
    console.log('📊 PRACTICE DATA AVAILABLE:', practiceData);

    // Simplified query for pre-aggregated data
    const query = `
      SELECT 
        practice,
        practice_primary,
        practice_uid,
        provider_name,
        measure,
        frequency,
        date_index,
        display_date,
        measure_value,
        measure_type
      FROM ih.agg_app_measures
      WHERE frequency = 'Monthly'
        AND measure IN ('Charges by Provider','Payments by Provider')
        AND practice_uid = $1
      ORDER BY date_index ASC
    `;

    // Log the exact query being executed
    console.log('🔍 CHARGES & PAYMENTS SQL:', {
      sql: query,
      practiceUid: practiceUid,
      practiceUidType: typeof practiceUid
    });

    // Execute the query
    const queryStart = Date.now();
    const data = await executeAnalyticsQuery(query, [practiceUid]);
    logPerformanceMetric(logger, 'charges_payments_query_execution', Date.now() - queryStart);

    console.log('✅ CHARGES & PAYMENTS RESULT:', {
      rowCount: data.length,
      sampleRows: data.slice(0, 3)
    });

    // Log successful operation
    logDBOperation(logger, 'charges_payments_query', 'ih.gr_app_measures', startTime, data.length);

    logger.info('Charges and Payments analytics completed successfully', {
      resultCount: data.length,
      practiceUid: practiceUid,
      totalRequestTime: Date.now() - startTime
    });

    return createSuccessResponse({
      data: data,
      metadata: {
        practiceUid: practiceUid,
        rowCount: data.length,
        queryTimeMs: Date.now() - queryStart,
        generatedAt: new Date().toISOString()
      }
    }, 'Charges and Payments data retrieved successfully');
    
  } catch (error) {
    logger.error('Charges and Payments analytics error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      requestingUserId: userContext.user_id
    });
    
    logPerformanceMetric(logger, 'charges_payments_request_failed', Date.now() - startTime);
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  } finally {
    logPerformanceMetric(logger, 'charges_payments_total', Date.now() - startTime);
  }
};

// Uses analytics:read:all permission (granted via roles)
// Super admins bypass permission checks automatically
export const GET = rbacRoute(
  chargesPaymentsHandler,
  {
    permission: 'analytics:read:all',
    rateLimit: 'api'
  }
);
