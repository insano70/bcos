import type { NextRequest } from 'next/server';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log } from '@/lib/logger';
import { createRBACReportCardService } from '@/lib/services/report-card';
import type { UserContext } from '@/lib/types/rbac';
import { reportCardParamsSchema } from '@/lib/validations/report-card';
import { PermissionDeniedError } from '@/lib/errors/rbac-errors';
import { z } from 'zod';

/**
 * Report Card API - Get grade history for a practice
 * Returns the last N months of report card grades
 */

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(24).optional().default(12),
});

const getGradeHistoryHandler = async (
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
    const queryResult = historyQuerySchema.safeParse({
      limit: searchParams.get('limit') || undefined,
    });

    const practiceUidNum = parseInt(paramsResult.data.practiceUid, 10);
    const limit = queryResult.success ? queryResult.data.limit : 12;

    // Get grade history
    const service = createRBACReportCardService(userContext);
    const history = await service.getGradeHistory(practiceUidNum, limit);

    const duration = Date.now() - startTime;

    log.info('Fetched grade history', {
      operation: 'get_grade_history',
      practiceUid,
      limit,
      historyCount: history.length,
      userId: userContext.user_id,
      duration,
      component: 'report-card',
    });

    return createSuccessResponse(
      { history },
      'Grade history retrieved successfully'
    );
  } catch (error) {
    const duration = Date.now() - startTime;

    // SECURITY: Return 404 for access denied (prevent enumeration)
    if (error instanceof PermissionDeniedError) {
      log.info('Grade history access denied', {
        practiceUid,
        userId: userContext.user_id,
        duration,
        component: 'report-card',
      });
      return createErrorResponse('Grade history not found', 404, request);
    }

    log.error('Failed to get grade history', error as Error, {
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

export const GET = rbacRoute(getGradeHistoryHandler, {
  permission: ['analytics:read:organization', 'analytics:read:all'],
  rateLimit: 'api',
});

