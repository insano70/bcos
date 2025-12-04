import type { NextRequest } from 'next/server';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log } from '@/lib/logger';
import { createRBACReportCardService } from '@/lib/services/report-card';
import type { UserContext } from '@/lib/types/rbac';
import { peerComparisonQuerySchema } from '@/lib/validations/report-card';
import type { SizeBucket } from '@/lib/constants/report-card';

/**
 * Report Card API - Get peer comparison statistics
 */

const getPeerComparisonHandler = async (
  request: NextRequest,
  userContext: UserContext
) => {
  const startTime = Date.now();

  try {
    // Parse query params
    const { searchParams } = new URL(request.url);
    const queryResult = peerComparisonQuerySchema.safeParse({
      bucket: searchParams.get('bucket') || undefined,
    });

    const sizeBucket = queryResult.success
      ? queryResult.data.bucket as SizeBucket | undefined
      : undefined;

    // Get peer comparison
    const service = createRBACReportCardService(userContext);
    const comparison = await service.getPeerComparison(sizeBucket);

    const duration = Date.now() - startTime;

    log.info('Fetched peer comparison', {
      operation: 'get_peer_comparison',
      sizeBucket: sizeBucket || 'default',
      practiceCount: comparison.practice_count,
      userId: userContext.user_id,
      duration,
      component: 'report-card',
    });

    return createSuccessResponse(
      { comparison },
      'Peer comparison retrieved successfully'
    );
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to get peer comparison', error as Error, {
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

export const GET = rbacRoute(getPeerComparisonHandler, {
  permission: ['analytics:read:organization', 'analytics:read:all'],
  rateLimit: 'api',
});


