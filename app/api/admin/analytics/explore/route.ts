import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { log } from '@/lib/logger';
import { executeAnalyticsQuery } from '@/lib/services/analytics-db';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Admin Analytics - Data Explorer
 * Quick endpoint to explore what data exists in ih.gr_app_measures
 */
const exploreHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  log.info('Analytics data exploration request initiated', {
    requestingUserId: userContext.user_id,
    isSuperAdmin: userContext.is_super_admin,
  });

  try {
    // Query to see what practice_uid values exist
    const practicesQuery = `
      SELECT DISTINCT practice_uid, COUNT(*) as record_count
      FROM ih.gr_app_measures
      GROUP BY practice_uid
      ORDER BY record_count DESC
      LIMIT 10
    `;

    // Query to see what measures exist
    const measuresQuery = `
      SELECT DISTINCT measure, frequency, COUNT(*) as record_count
      FROM ih.gr_app_measures
      GROUP BY measure, frequency
      ORDER BY record_count DESC
    `;

    // Query to see date ranges
    const dateRangeQuery = `
      SELECT
        MIN(period_start) as earliest_date,
        MAX(period_end) as latest_date,
        COUNT(*) as total_records
      FROM ih.gr_app_measures
    `;

    console.log('🔍 EXPLORING DATA - Practices Query:', practicesQuery);
    const practices = await executeAnalyticsQuery(practicesQuery, []);

    console.log('🔍 EXPLORING DATA - Measures Query:', measuresQuery);
    const measures = await executeAnalyticsQuery(measuresQuery, []);

    console.log('🔍 EXPLORING DATA - Date Range Query:', dateRangeQuery);
    const dateRange = await executeAnalyticsQuery(dateRangeQuery, []);

    const explorationData = {
      practices: practices,
      measures: measures,
      dateRange: dateRange[0] || null,
      summary: {
        totalPractices: practices.length,
        totalMeasureTypes: measures.length,
        totalRecords: dateRange[0]?.total_records || 0,
      },
    };

    console.log('✅ DATA EXPLORATION RESULTS:', explorationData);

    return createSuccessResponse(explorationData, 'Data exploration completed successfully');
  } catch (error) {
    log.error('Analytics data exploration error', error, {
      requestingUserId: userContext.user_id,
    });

    log.info('Analytics explore failed', { duration: Date.now() - startTime });
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  } finally {
    log.info('Analytics explore total', { duration: Date.now() - startTime });
  }
};

// Uses analytics:read:all permission (granted via roles)
// Super admins bypass permission checks automatically
export const GET = rbacRoute(exploreHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api',
});
