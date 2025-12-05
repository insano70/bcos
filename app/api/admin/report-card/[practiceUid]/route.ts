import type { NextRequest } from 'next/server';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log, logTemplates } from '@/lib/logger';
import { createRBACReportCardService } from '@/lib/services/report-card';
import type { UserContext } from '@/lib/types/rbac';
import { reportCardParamsSchema } from '@/lib/validations/report-card';
import { ReportCardNotFoundError } from '@/lib/errors/report-card-errors';
import { z } from 'zod';

/**
 * Report Card API - Get report card for a practice
 * 
 * Supports optional `month` query param to fetch a specific month's report card.
 * If no month is provided, returns the latest report card.
 */

const reportCardQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Month must be in YYYY-MM-DD format').optional(),
});

const getReportCardHandler = async (
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
    const validationResult = reportCardParamsSchema.safeParse({ practiceUid });

    if (!validationResult.success) {
      return createErrorResponse('Invalid practice UID', 400, request);
    }

    // Parse optional month query param
    const { searchParams } = new URL(request.url);
    const queryResult = reportCardQuerySchema.safeParse({
      month: searchParams.get('month') || undefined,
    });

    const practiceUidNum = parseInt(validationResult.data.practiceUid, 10);
    const month = queryResult.success ? queryResult.data.month : undefined;

    const service = createRBACReportCardService(userContext);

    // Get report card - either by specific month or latest
    const reportCard = month
      ? await service.getReportCardByMonth(practiceUidNum, month)
      : await service.getReportCard(practiceUidNum);

    // Get previous month summary for comparison
    const previousMonth = await service.getPreviousMonthSummary(
      practiceUidNum,
      reportCard.report_card_month
    );

    // Get available months for month selector
    const availableMonths = await service.getAvailableMonths(practiceUidNum, 6);

    const duration = Date.now() - startTime;

    const template = logTemplates.crud.read('report_card', {
      resourceId: practiceUid,
      userId: userContext.user_id,
      duration,
      found: true,
    });

    log.info(template.message, { ...template.context, component: 'report-card', month });

    return createSuccessResponse(
      { reportCard, previousMonth, availableMonths },
      'Report card retrieved successfully'
    );
  } catch (error) {
    const duration = Date.now() - startTime;

    if (error instanceof ReportCardNotFoundError) {
      log.info('Report card not found', {
        practiceUid,
        userId: userContext.user_id,
        duration,
        component: 'report-card',
      });
      return createErrorResponse('Report card not found', 404, request);
    }

    log.error('Failed to get report card', error as Error, {
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

export const GET = rbacRoute(getReportCardHandler, {
  permission: ['analytics:read:own', 'analytics:read:organization', 'analytics:read:all'],
  rateLimit: 'api',
});
