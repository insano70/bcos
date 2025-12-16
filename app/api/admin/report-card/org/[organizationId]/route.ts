import type { NextRequest } from 'next/server';
import { createErrorResponse, handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log, logTemplates } from '@/lib/logger';
import { createRBACReportCardService, engagementMetricService } from '@/lib/services/report-card';
import type { UserContext } from '@/lib/types/rbac';
import { ReportCardNotFoundError } from '@/lib/errors/report-card-errors';
import { PermissionDeniedError } from '@/lib/errors/rbac-errors';
import { z } from 'zod';

/**
 * Report Card API - Get report card for an organization
 *
 * Primary endpoint for UI - users select by organization, not practice.
 * Supports optional `month` query param to fetch a specific month's report card.
 * If no month is provided, returns the latest report card.
 */

const organizationIdSchema = z.object({
  organizationId: z.string().uuid('Organization ID must be a valid UUID'),
});

const reportCardQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Month must be in YYYY-MM-DD format')
    .optional(),
});

const getReportCardByOrgHandler = async (
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
    const validationResult = organizationIdSchema.safeParse({ organizationId });

    if (!validationResult.success) {
      return createErrorResponse('Invalid organization ID', 400, request);
    }

    // Parse optional month query param
    const { searchParams } = new URL(request.url);
    const queryResult = reportCardQuerySchema.safeParse({
      month: searchParams.get('month') || undefined,
    });

    const month = queryResult.success ? queryResult.data.month : undefined;

    const service = createRBACReportCardService(userContext);

    // Get report card - either by specific month or latest
    const reportCard = month
      ? await service.getReportCardByOrganizationAndMonth(organizationId, month)
      : await service.getReportCardByOrganization(organizationId);

    // Get previous month summary for comparison
    const previousMonth = await service.getPreviousMonthSummaryByOrganization(
      organizationId,
      reportCard.report_card_month
    );

    // Get available months for month selector
    const availableMonths = await service.getAvailableMonthsByOrganization(organizationId, 6);

    // Get grade history for the Grade History table
    const gradeHistory = await service.getGradeHistoryByOrganization(organizationId, 12);

    // Get trends for the Trend Chart (3, 6, and 9 month trends)
    const trends = await service.getTrendsByOrganization(organizationId);

    // Get engagement metric (logins + session resumes per week)
    const engagementMetric = await engagementMetricService.getEngagementMetric(organizationId);

    const duration = Date.now() - startTime;

    const template = logTemplates.crud.read('report_card', {
      resourceId: organizationId,
      userId: userContext.user_id,
      duration,
      found: true,
    });

    log.info(template.message, {
      ...template.context,
      component: 'report-card',
      month,
      queryBy: 'organization_id',
    });

    return createSuccessResponse(
      { reportCard, previousMonth, availableMonths, gradeHistory, trends, engagementMetric },
      'Report card retrieved successfully'
    );
  } catch (error) {
    const duration = Date.now() - startTime;

    // SECURITY: Return 404 for both not found AND access denied (prevent enumeration)
    if (error instanceof ReportCardNotFoundError || error instanceof PermissionDeniedError) {
      log.info('Report card not found or access denied', {
        organizationId,
        userId: userContext.user_id,
        duration,
        errorType: error.constructor.name,
        component: 'report-card',
      });
      return createErrorResponse('Report card not found', 404, request);
    }

    log.error('Failed to get report card', error as Error, {
      organizationId,
      userId: userContext.user_id,
      duration,
      component: 'report-card',
    });

    return handleRouteError(error, 'Failed to retrieve report card', request);
  }
};

export const GET = rbacRoute(getReportCardByOrgHandler, {
  permission: ['analytics:read:organization', 'analytics:read:all'],
  rateLimit: 'api',
});

