import type { NextRequest } from 'next/server';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log, logTemplates } from '@/lib/logger';
import { createRBACReportCardService } from '@/lib/services/report-card';
import type { UserContext } from '@/lib/types/rbac';
import { reportCardParamsSchema } from '@/lib/validations/report-card';
import { ReportCardNotFoundError } from '@/lib/errors/report-card-errors';

/**
 * Report Card API - Get report card for a practice
 */

const getReportCardHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  const { params } = args[0] as { params: { practiceUid: string } };
  const practiceUid = params.practiceUid;

  try {
    // Validate params
    const validationResult = reportCardParamsSchema.safeParse({ practiceUid });

    if (!validationResult.success) {
      return createErrorResponse('Invalid practice UID', 400, request);
    }

    const practiceUidNum = parseInt(validationResult.data.practiceUid, 10);

    // Get report card
    const service = createRBACReportCardService(userContext);
    const reportCard = await service.getReportCard(practiceUidNum);

    const duration = Date.now() - startTime;

    const template = logTemplates.crud.read('report_card', {
      resourceId: practiceUid,
      userId: userContext.user_id,
      duration,
      found: true,
    });

    log.info(template.message, { ...template.context, component: 'report-card' });

    return createSuccessResponse(
      { reportCard },
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
