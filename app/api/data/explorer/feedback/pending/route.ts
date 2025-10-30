import { type NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { validateQuery } from '@/lib/api/middleware/validation';
import { createPaginatedResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createRBACExplorerFeedbackService } from '@/lib/services/data-explorer';
import { feedbackQuerySchema } from '@/lib/validations/data-explorer';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import type { FeedbackQueryOptions } from '@/lib/types/data-explorer';

const listPendingFeedbackHandler = async (
  request: NextRequest,
  userContext: UserContext
): Promise<Response> => {
  const startTime = Date.now();

  try {
    // 1. Validate query params
    const { searchParams } = new URL(request.url);
    const rawQuery = validateQuery(searchParams, feedbackQuerySchema);

    // Remove undefined values to match FeedbackQueryOptions type
    const query: FeedbackQueryOptions = {};
    if (rawQuery.status !== undefined) query.status = rawQuery.status;
    if (rawQuery.severity !== undefined) query.severity = rawQuery.severity;
    if (rawQuery.feedback_type !== undefined) query.feedback_type = rawQuery.feedback_type;
    if (rawQuery.limit !== undefined) query.limit = rawQuery.limit;
    if (rawQuery.offset !== undefined) query.offset = rawQuery.offset;

    // 2. Create feedback service
    const feedbackService = createRBACExplorerFeedbackService(userContext);

    // 3. Get feedback list
    const feedback = await feedbackService.listPendingFeedback(query);

    // 4. Get total count
    const totalCount = await feedbackService.getFeedbackCount(query);

    const duration = Date.now() - startTime;

    log.info('Feedback list query completed', {
      operation: 'data_explorer_list_feedback',
      resourceType: 'data_explorer_feedback',
      userId: userContext.user_id,
      results: { returned: feedback.length, total: totalCount },
      duration,
      component: 'business-logic',
    });

    // 5. Return paginated response
    return createPaginatedResponse(feedback, {
      page: Math.floor((query.offset || 0) / (query.limit || 50)) + 1,
      limit: query.limit || 50,
      total: totalCount,
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Feedback list query failed', error, {
      operation: 'data_explorer_list_feedback',
      userId: userContext.user_id,
      duration,
      component: 'business-logic',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to fetch feedback',
      500,
      request
    );
  }
};

export const GET = rbacRoute(listPendingFeedbackHandler, {
  permission: ['data-explorer:manage:all'],
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';

