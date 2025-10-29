import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createPaginatedResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createRBACExplorerHistoryService } from '@/lib/services/data-explorer';
import { queryHistoryParamsSchema } from '@/lib/validations/data-explorer';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import { z } from 'zod';

const getHistoryHandler = async (
  request: NextRequest,
  userContext: UserContext
): Promise<Response> => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const rawParams = Object.fromEntries(searchParams.entries());
    const query = queryHistoryParamsSchema.parse(rawParams);

    const historyService = createRBACExplorerHistoryService(userContext);
    const { items, total } = await historyService.listHistory({
      limit: query.limit,
      offset: query.offset,
      ...(query.status && { status: query.status }),
    });

    const duration = Date.now() - startTime;

    log.info('Query history retrieved', {
      operation: 'data_explorer_list_history',
      resourceType: 'data_explorer_history',
      userId: userContext.user_id,
      results: { returned: items.length, total },
      duration,
      component: 'business-logic',
    });

    return createPaginatedResponse(items, {
      page: Math.floor((query.offset || 0) / (query.limit || 50)) + 1,
      limit: query.limit || 50,
      total,
    });
  } catch (error) {
    log.error('Get query history failed', error as Error, {
      operation: 'data_explorer_list_history',
      userId: userContext.user_id,
      duration: Date.now() - startTime,
      component: 'business-logic',
    });

    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map((issue) => issue.message).join(', ');
      return createErrorResponse(`Validation failed: ${errorMessages}`, 400, request);
    }

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to fetch query history',
      500,
      request
    );
  }
};

export const GET = rbacRoute(getHistoryHandler, {
  permission: [
    'data-explorer:history:read:own',
    'data-explorer:history:read:organization',
    'data-explorer:history:read:all',
  ],
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';

