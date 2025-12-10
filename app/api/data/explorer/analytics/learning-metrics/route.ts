import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { handleRouteError } from '@/lib/api/responses/error';
import { FeedbackAnalyticsService } from '@/lib/services/data-explorer/feedback-analytics-service';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

const getLearningMetricsHandler = async (
  request: NextRequest,
  userContext: UserContext
): Promise<Response> => {
  const startTime = Date.now();

  try {
    const analyticsService = new FeedbackAnalyticsService(userContext);
    const metrics = await analyticsService.getLearningMetrics();

    const duration = Date.now() - startTime;

    log.info('Learning metrics retrieved', {
      operation: 'get_learning_metrics',
      userId: userContext.user_id,
      editRate: metrics.editRate,
      improvementScore: metrics.improvementScore,
      duration,
      component: 'api',
    });

    return createSuccessResponse(metrics);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to retrieve learning metrics', error, {
      operation: 'get_learning_metrics',
      userId: userContext.user_id,
      duration,
      component: 'api',
    });

    return handleRouteError(error, 'Failed to process data explorer request', request);
  }
};

export const GET = rbacRoute(getLearningMetricsHandler, {
  permission: ['data-explorer:manage:all'],
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';


