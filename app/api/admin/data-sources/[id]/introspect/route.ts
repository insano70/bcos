import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { extractRouteParams } from '@/lib/api/utils/params';
import { log } from '@/lib/logger';
import { createRBACDataSourcesService } from '@/lib/services/rbac-data-sources-service';
import type { UserContext } from '@/lib/types/rbac';
import { dataSourceParamsSchema } from '@/lib/validations/data-sources';

/**
 * Admin Data Source Introspection API
 * Introspects the specific table defined in a data source and creates column definitions
 */

// POST - Introspect data source columns
const introspectDataSourceHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  let dataSourceId: number | undefined;

  try {
    const { id } = await extractRouteParams(args[0], dataSourceParamsSchema);
    dataSourceId = parseInt(id, 10);

    log.info('Data source introspection request initiated', {
      requestingUserId: userContext.user_id,
      dataSourceId,
    });

    // Create service instance and introspect columns
    const dataSourcesService = createRBACDataSourcesService(userContext);
    const result = await dataSourcesService.introspectDataSourceColumns(dataSourceId);

    log.info('Data source introspection completed', { duration: Date.now() - startTime });

    return createSuccessResponse(result, `Successfully introspected ${result.created} columns`);
  } catch (error) {
    log.error('Data source introspection error', error, {
      requestingUserId: userContext.user_id,
      dataSourceId,
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

export const POST = rbacRoute(introspectDataSourceHandler, {
  permission: ['data-sources:create:organization', 'data-sources:create:all'],
  rateLimit: 'api',
});
