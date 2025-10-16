import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { extractRouteParams } from '@/lib/api/utils/params';
import { log } from '@/lib/logger';
import { createRBACDataSourcesService } from '@/lib/services/rbac-data-sources-service';
import type { UserContext } from '@/lib/types/rbac';
import { dataSourceParamsSchema } from '@/lib/validations/data-sources';

/**
 * Admin Data Sources Connection Test API
 * Tests connectivity to a specific data source
 */

// POST - Test connection to data source
const testConnectionHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  let dataSourceId: number | undefined;

  try {
    const { id } = await extractRouteParams(args[0], dataSourceParamsSchema);
    dataSourceId = parseInt(id, 10);

    // Create service instance and test connection
    const dataSourcesService = createRBACDataSourcesService(userContext);
    const testResult = await dataSourcesService.testConnection(dataSourceId);

    const duration = Date.now() - startTime;

    log.info(`data source connection test ${testResult.success ? 'succeeded' : 'failed'}`, {
      operation: 'test_data_source_connection',
      resourceType: 'data_source',
      resourceId: dataSourceId,
      userId: userContext.user_id,
      test: {
        success: testResult.success,
        ...(testResult.error && { error: testResult.error }),
        ...(testResult.details && { details: testResult.details }),
      },
      duration,
      slow: duration > 5000,
      component: 'admin',
    });

    const message = testResult.success
      ? 'Connection test successful'
      : `Connection test failed: ${testResult.error}`;

    return createSuccessResponse(testResult, message);
  } catch (error) {
    log.error('data source connection test failed', error, {
      operation: 'test_data_source_connection',
      resourceId: dataSourceId,
      userId: userContext.user_id,
      component: 'admin',
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

export const POST = rbacRoute(testConnectionHandler, {
  permission: ['data-sources:read:organization', 'data-sources:read:all'],
  rateLimit: 'api',
});
