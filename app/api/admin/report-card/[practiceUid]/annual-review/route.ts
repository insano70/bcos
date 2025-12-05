import type { NextRequest } from 'next/server';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log } from '@/lib/logger';
import { createRBACReportCardService } from '@/lib/services/report-card';
import type { UserContext } from '@/lib/types/rbac';
import { reportCardParamsSchema } from '@/lib/validations/report-card';

/**
 * Report Card API - Get annual review for a practice
 * Returns year-over-year comparison, monthly trends, and forecasts
 */

const getAnnualReviewHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  const { params } = args[0] as { params: Promise<{ practiceUid: string }> };
  const resolvedParams = await params;
  const practiceUid = resolvedParams.practiceUid;

  try {
    // Validate params
    const paramsResult = reportCardParamsSchema.safeParse({ practiceUid });

    if (!paramsResult.success) {
      return createErrorResponse('Invalid practice UID', 400, request);
    }

    const practiceUidNum = parseInt(paramsResult.data.practiceUid, 10);

    // Get annual review
    const service = createRBACReportCardService(userContext);
    const review = await service.getAnnualReview(practiceUidNum);

    const duration = Date.now() - startTime;

    log.info('Fetched annual review', {
      operation: 'get_annual_review',
      practiceUid,
      monthsAnalyzed: review.summary.monthsAnalyzed,
      userId: userContext.user_id,
      duration,
      component: 'report-card',
    });

    return createSuccessResponse(
      { review },
      'Annual review retrieved successfully'
    );
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to get annual review', error as Error, {
      practiceUid,
      userId: userContext.user_id,
      duration,
      component: 'report-card',
    });

    const errorMessage =
      process.env.NODE_ENV === 'development'
        ? error instanceof Error
          ? error.message
          : 'Unknown error'
        : 'Internal server error';

    return createErrorResponse(errorMessage, 500, request);
  }
};

export const GET = rbacRoute(getAnnualReviewHandler, {
  permission: ['analytics:read:own', 'analytics:read:organization', 'analytics:read:all'],
  rateLimit: 'api',
});

