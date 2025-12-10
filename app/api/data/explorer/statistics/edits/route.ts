import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { handleRouteError } from '@/lib/api/responses/error';
import { createRBACExplorerHistoryService } from '@/lib/services/data-explorer';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

const getEditStatisticsHandler = async (
  request: NextRequest,
  userContext: UserContext
): Promise<Response> => {
  const startTime = Date.now();

  try {
    const historyService = createRBACExplorerHistoryService(userContext);
    const statistics = await historyService.getEditStatistics();

    const duration = Date.now() - startTime;

    log.info('Edit statistics retrieved', {
      operation: 'data_explorer_edit_statistics',
      resourceType: 'data_explorer_statistics',
      userId: userContext.user_id,
      duration,
      component: 'business-logic',
    });

    return createSuccessResponse(statistics);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to retrieve edit statistics', error, {
      operation: 'data_explorer_edit_statistics',
      userId: userContext.user_id,
      duration,
      component: 'business-logic',
    });

    return handleRouteError(error, 'Failed to process data explorer request', request);
  }
};

export const GET = rbacRoute(getEditStatisticsHandler, {
  permission: ['data-explorer:manage:all'],
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';


