import type { NextRequest } from 'next/server';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log } from '@/lib/logger';
import { executeAnalyticsQuery } from '@/lib/services/analytics-db';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Admin Analytics - Charges and Payments Chart
 * Specific endpoint for the Charges vs Payments chart using exact SQL
 */
const chargesPaymentsHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  log.info('Charges and Payments analytics request initiated', {
    requestingUserId: userContext.user_id,
    isSuperAdmin: userContext.is_super_admin,
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

    log.debug('exploring practice data', { practiceUid, exploreQuery });
    const practiceData = await executeAnalyticsQuery(exploreQuery, [practiceUid]);
    log.debug('practice data available', { practiceData });

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
    log.debug('charges and payments SQL query', {
      sql: query,
      practiceUid: practiceUid,
      practiceUidType: typeof practiceUid,
    });

    // Execute the query
    const queryStart = Date.now();
    const data = await executeAnalyticsQuery(query, [practiceUid]);
    log.info('Charges payments query completed', { duration: Date.now() - queryStart });

    log.debug('charges and payments query result', {
      rowCount: data.length,
      sampleRows: data.slice(0, 3),
    });

    // Log successful operation
    log.db('SELECT', 'ih.gr_app_measures', Date.now() - startTime, { rowCount: data.length });

    log.info('Charges and Payments analytics completed successfully', {
      resultCount: data.length,
      practiceUid: practiceUid,
      totalRequestTime: Date.now() - startTime,
    });

    return createSuccessResponse(
      {
        data: data,
        metadata: {
          practiceUid: practiceUid,
          rowCount: data.length,
          queryTimeMs: Date.now() - queryStart,
          generatedAt: new Date().toISOString(),
        },
      },
      'Charges and Payments data retrieved successfully'
    );
  } catch (error) {
    log.error('Charges and Payments analytics error', error, {
      requestingUserId: userContext.user_id,
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// Uses analytics:read:all permission (granted via roles)
// Super admins bypass permission checks automatically
export const GET = rbacRoute(chargesPaymentsHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api',
});
