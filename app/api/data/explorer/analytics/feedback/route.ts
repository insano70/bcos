import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { handleRouteError } from '@/lib/api/responses/error';
import { FeedbackAnalyticsService } from '@/lib/services/data-explorer/feedback-analytics-service';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

const getFeedbackAnalyticsHandler = async (
  request: NextRequest,
  userContext: UserContext
): Promise<Response> => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');

    const dateRange =
      startDate && endDate
        ? {
            start: new Date(startDate),
            end: new Date(endDate),
          }
        : undefined;

    const analyticsService = new FeedbackAnalyticsService(userContext);
    const analytics = await analyticsService.getAnalytics(dateRange);

    const duration = Date.now() - startTime;

    log.info('Feedback analytics retrieved', {
      operation: 'get_feedback_analytics',
      userId: userContext.user_id,
      dateRange: dateRange ? `${startDate} to ${endDate}` : 'all time',
      duration,
      component: 'api',
    });

    return createSuccessResponse(analytics);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to retrieve feedback analytics', error, {
      operation: 'get_feedback_analytics',
      userId: userContext.user_id,
      duration,
      component: 'api',
    });

    return handleRouteError(error, 'Failed to process data explorer request', request);
  }
};

export const GET = rbacRoute(getFeedbackAnalyticsHandler, {
  permission: ['data-explorer:manage:all'],
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';


