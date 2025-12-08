import type { NextRequest } from 'next/server';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log } from '@/lib/logger';
import { createRBACReportCardService } from '@/lib/services/report-card';
import type { UserContext } from '@/lib/types/rbac';
import { reportCardParamsSchema, trendQuerySchema } from '@/lib/validations/report-card';
import { PermissionDeniedError } from '@/lib/errors/rbac-errors';
import type { TrendPeriod } from '@/lib/constants/report-card';

/**
 * Report Card API - Get trends for a practice
 */

const getTrendsHandler = async (
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

    // Parse query params
    const { searchParams } = new URL(request.url);
    const queryResult = trendQuerySchema.safeParse({
      period: searchParams.get('period') || undefined,
    });

    const practiceUidNum = parseInt(paramsResult.data.practiceUid, 10);
    const period = queryResult.success ? queryResult.data.period as TrendPeriod | undefined : undefined;

    // Get trends
    const service = createRBACReportCardService(userContext);
    const trends = await service.getTrends(practiceUidNum, period);

    const duration = Date.now() - startTime;

    log.info('Fetched practice trends', {
      operation: 'get_trends',
      practiceUid,
      period: period || 'all',
      trendCount: trends.length,
      userId: userContext.user_id,
      duration,
      component: 'report-card',
    });

    return createSuccessResponse(
      { trends },
      'Trends retrieved successfully'
    );
  } catch (error) {
    const duration = Date.now() - startTime;

    // SECURITY: Return 404 for access denied (prevent enumeration)
    if (error instanceof PermissionDeniedError) {
      log.info('Trends access denied', {
        practiceUid,
        userId: userContext.user_id,
        duration,
        component: 'report-card',
      });
      return createErrorResponse('Trends not found', 404, request);
    }

    log.error('Failed to get trends', error as Error, {
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

export const GET = rbacRoute(getTrendsHandler, {
  permission: ['analytics:read:organization', 'analytics:read:all'],
  rateLimit: 'api',
});
