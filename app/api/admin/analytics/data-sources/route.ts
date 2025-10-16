import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { log } from '@/lib/logger';
import { chartConfigService } from '@/lib/services/chart-config-service';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Admin Analytics - Data Sources List API
 * Returns all available data sources from chart_data_sources table
 */
const dataSourcesHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  log.info('Data sources list request initiated', {
    requestingUserId: userContext.user_id,
  });

  try {
    // Get all available data sources from database
    const dataSources = await chartConfigService.getAllDataSources();

    const responseData = {
      dataSources,
      metadata: {
        totalSources: dataSources.length,
        generatedAt: new Date().toISOString(),
      },
    };

    log.info('Data sources loaded', { duration: Date.now() - startTime });

    return createSuccessResponse(responseData, 'Data sources retrieved successfully');
  } catch (error) {
    log.error('Data sources list error', error, {
      requestingUserId: userContext.user_id,
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

export const GET = rbacRoute(dataSourcesHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api',
});
