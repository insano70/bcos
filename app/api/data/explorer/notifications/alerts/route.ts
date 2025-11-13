import { type NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createRBACExplorerFeedbackNotificationService } from '@/lib/services/data-explorer';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

const getAlertsHandler = async (
  request: NextRequest,
  userContext: UserContext
): Promise<Response> => {
  const startTime = Date.now();

  try {
    const notificationService = createRBACExplorerFeedbackNotificationService(userContext);
    const alerts = await notificationService.checkForAlerts();

    const duration = Date.now() - startTime;

    log.info('Alerts retrieved', {
      operation: 'get_alerts',
      userId: userContext.user_id,
      alertCount: alerts.length,
      duration,
      component: 'api',
    });

    return createSuccessResponse(alerts);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to retrieve alerts', error, {
      operation: 'get_alerts',
      userId: userContext.user_id,
      duration,
      component: 'api',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to retrieve alerts',
      500,
      request
    );
  }
};

export const GET = rbacRoute(getAlertsHandler, {
  permission: ['data-explorer:manage:all'],
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';





