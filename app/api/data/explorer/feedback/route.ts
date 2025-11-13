import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createRBACExplorerFeedbackService } from '@/lib/services/data-explorer';
import { submitFeedbackSchema } from '@/lib/validations/data-explorer';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

const submitFeedbackHandler = async (
  request: NextRequest,
  userContext: UserContext
): Promise<Response> => {
  const startTime = Date.now();

  try {
    // 1. Validate request body
    const validatedData = await validateRequest(request, submitFeedbackSchema);

    // 2. Create feedback service
    const feedbackService = createRBACExplorerFeedbackService(userContext);

    // 3. Create feedback entry
    const feedback = await feedbackService.createFeedback(validatedData);

    const duration = Date.now() - startTime;

    log.info('Feedback submitted successfully', {
      operation: 'data_explorer_submit_feedback',
      resourceType: 'data_explorer_feedback',
      resourceId: feedback.feedback_id,
      userId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      feedbackType: feedback.feedback_type,
      severity: feedback.severity,
      duration,
      component: 'business-logic',
    });

    return createSuccessResponse(feedback, 'Feedback submitted successfully');
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Feedback submission failed', error, {
      operation: 'data_explorer_submit_feedback',
      userId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      duration,
      component: 'business-logic',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Feedback submission failed',
      500,
      request
    );
  }
};

export const POST = rbacRoute(submitFeedbackHandler, {
  permission: ['data-explorer:query:organization', 'data-explorer:query:all'],
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';

