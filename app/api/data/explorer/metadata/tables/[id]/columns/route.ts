import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createRBACExplorerMetadataService } from '@/lib/services/data-explorer';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

const getColumnsHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
): Promise<Response> => {
  try {
    const params = (args[0] as { params: { id: string } }).params;
    const id = params.id;
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

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to fetch column metadata',
      500,
      request
    );
  }
};

export const GET = rbacRoute(getColumnsHandler, {
  permission: ['data-explorer:metadata:read:organization', 'data-explorer:metadata:read:all'],
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';

