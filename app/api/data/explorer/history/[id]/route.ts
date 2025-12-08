import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createRBACExplorerHistoryService } from '@/lib/services/data-explorer';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

const getQueryHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
): Promise<Response> => {
  try {
    const { params } = args[0] as { params: Promise<{ id: string }> };
    const resolvedParams = await params;
    const id = resolvedParams.id;

    const historyService = createRBACExplorerHistoryService(userContext);
    const query = await historyService.getQueryById(id);

    if (!query) {
      return createErrorResponse('Query not found', 404, request);
    }

    log.info('Query detail retrieved', {
      operation: 'data_explorer_get_query',
      resourceType: 'data_explorer_history',
      resourceId: id,
      userId: userContext.user_id,
      component: 'business-logic',
    });

    return createSuccessResponse(query);
  } catch (error) {
    log.error('Get query detail failed', error as Error, {
      operation: 'data_explorer_get_query',
      userId: userContext.user_id,
      component: 'business-logic',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to fetch query details',
      500,
      request
    );
  }
};

export const GET = rbacRoute(getQueryHandler, {
  permission: ['data-explorer:read:organization', 'data-explorer:read:all'],
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';

