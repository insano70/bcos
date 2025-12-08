import type { NextRequest } from 'next/server';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log } from '@/lib/logger';
import { createRBACReportCardService } from '@/lib/services/report-card';
import type { UserContext } from '@/lib/types/rbac';
import { reportCardParamsSchema, locationComparisonQuerySchema } from '@/lib/validations/report-card';
import { PermissionDeniedError } from '@/lib/errors/rbac-errors';

/**
 * Report Card API - Get location comparison for a practice
 */

const getLocationComparisonHandler = async (
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
    const queryResult = locationComparisonQuerySchema.safeParse({
      measure: searchParams.get('measure') || undefined,
    });

    const practiceUidNum = parseInt(paramsResult.data.practiceUid, 10);
    const measureName = queryResult.success ? queryResult.data.measure : undefined;

    // Get location comparison
    const service = createRBACReportCardService(userContext);
    const comparison = await service.getLocationComparison(practiceUidNum, measureName);

    const duration = Date.now() - startTime;

    log.info('Fetched location comparison', {
      operation: 'get_location_comparison',
      practiceUid,
      measureName: measureName || 'all',
      locationCount: comparison.locations.length,
      userId: userContext.user_id,
      duration,
      component: 'report-card',
    });

    return createSuccessResponse(
      { comparison },
      'Location comparison retrieved successfully'
    );
  } catch (error) {
    const duration = Date.now() - startTime;

    // SECURITY: Return 404 for access denied (prevent enumeration)
    if (error instanceof PermissionDeniedError) {
      log.info('Location comparison access denied', {
        practiceUid,
        userId: userContext.user_id,
        duration,
        component: 'report-card',
      });
      return createErrorResponse('Location comparison not found', 404, request);
    }

    log.error('Failed to get location comparison', error as Error, {
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

export const GET = rbacRoute(getLocationComparisonHandler, {
  permission: ['analytics:read:organization', 'analytics:read:all'],
  rateLimit: 'api',
});
