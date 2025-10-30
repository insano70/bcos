import { type NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createRBACExplorerSuggestionGeneratorService } from '@/lib/services/data-explorer';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

const getPendingSuggestionsHandler = async (
  request: NextRequest,
  userContext: UserContext
): Promise<Response> => {
  const startTime = Date.now();

  try {
    const suggestionService = createRBACExplorerSuggestionGeneratorService(userContext);
    const suggestions = await suggestionService.getPendingSuggestions();

    const duration = Date.now() - startTime;

    log.info('Pending suggestions retrieved', {
      operation: 'get_pending_suggestions',
      userId: userContext.user_id,
      count: suggestions.length,
      duration,
      component: 'api',
    });

    return createSuccessResponse(suggestions);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to retrieve pending suggestions', error, {
      operation: 'get_pending_suggestions',
      userId: userContext.user_id,
      duration,
      component: 'api',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to retrieve suggestions',
      500,
      request
    );
  }
};

export const GET = rbacRoute(getPendingSuggestionsHandler, {
  permission: ['data-explorer:manage:all'],
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';

