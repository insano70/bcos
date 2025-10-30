import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createRBACExplorerHistoryService } from '@/lib/services/data-explorer';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import { z } from 'zod';

const rateQuerySchema = z.object({
  rating: z.number().int().min(1).max(5),
  feedback: z.string().max(1000).optional(),
});

const rateQueryHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
): Promise<Response> => {
  try {
    const params = (args[0] as { params: { id: string } }).params;
    const id = params.id;

    const validatedData = await validateRequest(request, rateQuerySchema);

    const historyService = createRBACExplorerHistoryService(userContext);
    const updated = await historyService.rateQuery(
      id,
      validatedData.rating as 1 | 2 | 3 | 4 | 5,
      validatedData.feedback
    );

    if (!updated) {
      return createErrorResponse('Query not found', 404, request);
    }

    log.info('Query rated', {
      operation: 'data_explorer_rate_query',
      resourceType: 'data_explorer_history',
      resourceId: id,
      userId: userContext.user_id,
      rating: validatedData.rating,
      component: 'business-logic',
    });

    return createSuccessResponse(updated, 'Query rated successfully');
  } catch (error) {
    log.error('Rate query failed', error as Error, {
      operation: 'data_explorer_rate_query',
      userId: userContext.user_id,
      component: 'business-logic',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to rate query',
      500,
      request
    );
  }
};

export const POST = rbacRoute(rateQueryHandler, {
  permission: ['data-explorer:read:organization', 'data-explorer:read:all'],
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';

