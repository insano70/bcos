import { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractRouteParams } from '@/lib/api/utils/params';
import { dataSourceParamsSchema } from '@/lib/validations/data-sources';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';
import { createRBACDataSourcesService } from '@/lib/services/rbac-data-sources-service';

/**
 * Admin Data Sources Connection Test API
 * Tests connectivity to a specific data source
 */

// POST - Test connection to data source
const testConnectionHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const startTime = Date.now();
  let dataSourceId: number | undefined;

  try {
    const { id } = await extractRouteParams(args[0], dataSourceParamsSchema);
    dataSourceId = parseInt(id, 10);

    log.info('Data source connection test request initiated', {
      requestingUserId: userContext.user_id,
      dataSourceId
    });

    // Create service instance and test connection
    const dataSourcesService = createRBACDataSourcesService(userContext);
    const testResult = await dataSourcesService.testConnection(dataSourceId);

    log.info('Data source connection test completed', { duration: Date.now() - startTime });

    const message = testResult.success
      ? 'Connection test successful'
      : `Connection test failed: ${testResult.error}`;

    return createSuccessResponse(testResult, message);

  } catch (error) {
    log.error('Data source connection test error', error, {
      requestingUserId: userContext.user_id,
      dataSourceId
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

export const POST = rbacRoute(testConnectionHandler, {
  permission: ['data-sources:read:organization', 'data-sources:read:all'],
  rateLimit: 'api'
});
