import type { NextRequest } from 'next/server';
import { createErrorResponse, handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log } from '@/lib/logger';
import { createRBACReportCardService } from '@/lib/services/report-card';
import type { UserContext } from '@/lib/types/rbac';
import { PermissionDeniedError } from '@/lib/errors/rbac-errors';
import { z } from 'zod';

/**
 * Report Card API - Get annual review for an organization
 * Returns year-over-year comparison, monthly trends, and forecasts
 */

const organizationIdSchema = z.object({
  organizationId: z.string().uuid('Organization ID must be a valid UUID'),
});

const getAnnualReviewByOrgHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  const { params } = args[0] as { params: Promise<{ organizationId: string }> };
  const resolvedParams = await params;
  const organizationId = resolvedParams.organizationId;

  try {
    // Validate params
    const paramsResult = organizationIdSchema.safeParse({ organizationId });

    if (!paramsResult.success) {
      return createErrorResponse('Invalid organization ID', 400, request);
    }

    // Get annual review by organization
    const service = createRBACReportCardService(userContext);
    const review = await service.getAnnualReviewByOrganization(organizationId);

    const duration = Date.now() - startTime;

    log.info('Fetched annual review by organization', {
      operation: 'get_annual_review_by_org',
      organizationId,
      monthsAnalyzed: review.summary.monthsAnalyzed,
      userId: userContext.user_id,
      duration,
      component: 'report-card',
    });

    return createSuccessResponse({ review }, 'Annual review retrieved successfully');
  } catch (error) {
    const duration = Date.now() - startTime;

    // SECURITY: Return 404 for access denied (prevent enumeration)
    if (error instanceof PermissionDeniedError) {
      log.info('Annual review access denied', {
        organizationId,
        userId: userContext.user_id,
        duration,
        component: 'report-card',
      });
      return createErrorResponse('Annual review not found', 404, request);
    }

    log.error('Failed to get annual review by organization', error as Error, {
      organizationId,
      userId: userContext.user_id,
      duration,
      component: 'report-card',
    });

    return handleRouteError(error, 'Failed to retrieve annual review', request);
  }
};

export const GET = rbacRoute(getAnnualReviewByOrgHandler, {
  permission: ['analytics:read:organization', 'analytics:read:all'],
  rateLimit: 'api',
});

