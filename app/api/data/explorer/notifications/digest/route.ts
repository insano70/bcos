import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createRBACExplorerFeedbackNotificationService } from '@/lib/services/data-explorer';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

const getDailyDigestHandler = async (
  request: NextRequest,
  userContext: UserContext
): Promise<Response> => {
  const startTime = Date.now();

  try {
    const notificationService = createRBACExplorerFeedbackNotificationService(userContext);
    const digest = await notificationService.getDailyDigest();

    const duration = Date.now() - startTime;

    log.info('Daily digest retrieved', {
      operation: 'get_daily_digest',
      userId: userContext.user_id,
      newFeedback: digest.newFeedback,
      criticalIssues: digest.criticalIssues,
      duration,
      component: 'api',
    });

    return createSuccessResponse(digest);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to retrieve daily digest', error, {
      operation: 'get_daily_digest',
      userId: userContext.user_id,
      duration,
      component: 'api',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to retrieve digest',
      500,
      request
    );
  }
};

export const GET = rbacRoute(getDailyDigestHandler, {
  permission: ['data-explorer:manage:all'],
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';


