import { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { chartConfigService } from '@/lib/services/chart-config-service';
import type { UserContext } from '@/lib/types/rbac';
import { createAPILogger, logPerformanceMetric } from '@/lib/logger';

/**
 * Admin Analytics - Data Sources List API
 * Returns all available data sources from chart_data_sources table
 */
const dataSourcesHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();
  const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id);
  
  logger.info('Data sources list request initiated', {
    requestingUserId: userContext.user_id
  });

  try {
    // Get all available data sources from database
    const dataSources = await chartConfigService.getAllDataSources();

    const responseData = {
      dataSources,
      metadata: {
        totalSources: dataSources.length,
        generatedAt: new Date().toISOString(),
      }
    };

    logPerformanceMetric(logger, 'data_sources_list_load', Date.now() - startTime);

    return createSuccessResponse(responseData, 'Data sources retrieved successfully');
    
  } catch (error) {
    logger.error('Data sources list error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestingUserId: userContext.user_id
    });
    
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

export const GET = rbacRoute(dataSourcesHandler, {
  permission: 'analytics:read:all',
  rateLimit: 'api'
});

