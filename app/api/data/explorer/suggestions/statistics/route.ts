import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createRBACExplorerSuggestionGeneratorService } from '@/lib/services/data-explorer';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

const getSuggestionStatisticsHandler = async (
  request: NextRequest,
  userContext: UserContext
): Promise<Response> => {
  const startTime = Date.now();

  try {
    const suggestionService = createRBACExplorerSuggestionGeneratorService(userContext);
    const statistics = await suggestionService.getSuggestionStatistics();

    const duration = Date.now() - startTime;

    log.info('Suggestion statistics retrieved', {
      operation: 'get_suggestion_statistics',
      userId: userContext.user_id,
      duration,
      component: 'api',
    });

    return createSuccessResponse(statistics);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to retrieve suggestion statistics', error, {
      operation: 'get_suggestion_statistics',
      userId: userContext.user_id,
      duration,
      component: 'api',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to retrieve statistics',
      500,
      request
    );
  }
};

export const GET = rbacRoute(getSuggestionStatisticsHandler, {
  permission: ['data-explorer:manage:all'],
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';


