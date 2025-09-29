import { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractRouteParams } from '@/lib/api/utils/params';
import { dataSourceParamsSchema } from '@/lib/validations/data-sources';
import type { UserContext } from '@/lib/types/rbac';
import { createAppLogger, logPerformanceMetric } from '@/lib/logger';
import { createRBACDataSourcesService } from '@/lib/services/rbac-data-sources-service';

/**
 * Admin Data Source Introspection API
 * Introspects the specific table defined in a data source and creates column definitions
 */

// POST - Introspect data source columns
const introspectDataSourceHandler = async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
  const startTime = Date.now();
  const logger = createAppLogger('admin-data-sources').withUser(userContext.user_id, userContext.current_organization_id);
  let dataSourceId: number | undefined;

  try {
    const { id } = await extractRouteParams(args[0], dataSourceParamsSchema);
    dataSourceId = parseInt(id, 10);

    logger.info('Data source introspection request initiated', {
      requestingUserId: userContext.user_id,
      dataSourceId
    });

    // Create service instance and introspect columns
    const dataSourcesService = createRBACDataSourcesService(userContext);
    const result = await dataSourcesService.introspectDataSourceColumns(dataSourceId);

    logPerformanceMetric(logger, 'data_source_introspection', Date.now() - startTime);

    return createSuccessResponse(result, `Successfully introspected ${result.created} columns`);

  } catch (error) {
    logger.error('Data source introspection error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestingUserId: userContext.user_id,
      dataSourceId
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

export const POST = rbacRoute(introspectDataSourceHandler, {
  permission: ['data-sources:create:organization', 'data-sources:create:all'],
  rateLimit: 'api'
});
