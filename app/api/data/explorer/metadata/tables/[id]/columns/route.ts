import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { handleRouteError } from '@/lib/api/responses/error';
import { createRBACExplorerMetadataService } from '@/lib/services/data-explorer';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

const getColumnsHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
): Promise<Response> => {
  try {
    const { params } = args[0] as { params: Promise<{ id: string }> };
    const resolvedParams = await params;
    const id = resolvedParams.id;
    const metadataService = createRBACExplorerMetadataService(userContext);
    const columns = await metadataService.getColumnMetadata(id);

    log.info('Column metadata retrieved', {
      operation: 'data_explorer_get_columns',
      resourceType: 'data_explorer_metadata',
      resourceId: id,
      userId: userContext.user_id,
      columnCount: columns.length,
      component: 'business-logic',
    });

    return createSuccessResponse(columns);
  } catch (error) {
    log.error('Get column metadata failed', error as Error, {
      operation: 'data_explorer_get_columns',
      userId: userContext.user_id,
      component: 'business-logic',
    });

    return handleRouteError(error, 'Failed to process data explorer request', request);
  }
};

export const GET = rbacRoute(getColumnsHandler, {
  permission: ['data-explorer:read:organization', 'data-explorer:read:all'],
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';

