import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createRBACExplorerFeedbackService } from '@/lib/services/data-explorer';
import { resolveFeedbackSchema } from '@/lib/validations/data-explorer';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

const resolveFeedbackHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
): Promise<Response> => {
  const startTime = Date.now();

  try {
    // 1. Get feedback ID from params
    const context = args[0] as { params: Promise<{ id: string }> };
    const { id: feedbackId } = await context.params;

    // 2. Validate request body
    const validatedData = await validateRequest(request, resolveFeedbackSchema);

    // 3. Create feedback service
    const feedbackService = createRBACExplorerFeedbackService(userContext);

    // 4. Resolve feedback
    const feedback = await feedbackService.resolveFeedback(feedbackId, validatedData);

    const duration = Date.now() - startTime;

    log.info('Feedback resolved successfully', {
      operation: 'data_explorer_resolve_feedback',
      resourceType: 'data_explorer_feedback',
      resourceId: feedbackId,
      userId: userContext.user_id,
      resolutionStatus: validatedData.resolution_status,
      duration,
      component: 'business-logic',
    });

    return createSuccessResponse(feedback, 'Feedback resolved successfully');
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Feedback resolution failed', error, {
      operation: 'data_explorer_resolve_feedback',
      userId: userContext.user_id,
      duration,
      component: 'business-logic',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Feedback resolution failed',
      500,
      request
    );
  }
};

export const PUT = rbacRoute(resolveFeedbackHandler, {
  permission: ['data-explorer:manage:all'],
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';

