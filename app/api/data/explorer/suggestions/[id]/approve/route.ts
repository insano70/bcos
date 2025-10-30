import { type NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createRBACExplorerSuggestionGeneratorService } from '@/lib/services/data-explorer';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

const approveSuggestionHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
): Promise<Response> => {
  const startTime = Date.now();

  try {
    const context = args[0] as { params: Promise<{ id: string }> };
    const { id: suggestionId } = await context.params;

    const suggestionService = createRBACExplorerSuggestionGeneratorService(userContext);
    const result = await suggestionService.approveSuggestion(suggestionId);

    const duration = Date.now() - startTime;

    log.info('Suggestion approved', {
      operation: 'approve_suggestion',
      userId: userContext.user_id,
      suggestionId,
      duration,
      component: 'api',
    });

    return createSuccessResponse(result, 'Suggestion approved successfully');
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to approve suggestion', error, {
      operation: 'approve_suggestion',
      userId: userContext.user_id,
      duration,
      component: 'api',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to approve suggestion',
      500,
      request
    );
  }
};

export const POST = rbacRoute(approveSuggestionHandler, {
  permission: ['data-explorer:manage:all'],
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';

