import { type NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createRBACExplorerTestCaseGeneratorService } from '@/lib/services/data-explorer';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

const getTestCasesHandler = async (
  request: NextRequest,
  userContext: UserContext
): Promise<Response> => {
  const startTime = Date.now();

  try {
    const testCaseService = createRBACExplorerTestCaseGeneratorService(userContext);
    const testCases = await testCaseService.getTestCases();

    const duration = Date.now() - startTime;

    log.info('Test cases retrieved', {
      operation: 'get_test_cases',
      userId: userContext.user_id,
      count: testCases.length,
      duration,
      component: 'api',
    });

    return createSuccessResponse(testCases);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to retrieve test cases', error, {
      operation: 'get_test_cases',
      userId: userContext.user_id,
      duration,
      component: 'api',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to retrieve test cases',
      500,
      request
    );
  }
};

export const GET = rbacRoute(getTestCasesHandler, {
  permission: ['data-explorer:manage:all'],
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';





