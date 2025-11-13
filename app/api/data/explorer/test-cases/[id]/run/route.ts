import { type NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createRBACExplorerTestCaseGeneratorService } from '@/lib/services/data-explorer';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

const runTestCaseHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
): Promise<Response> => {
  const startTime = Date.now();

  try {
    const context = args[0] as { params: Promise<{ id: string }> };
    const { id: testCaseId } = await context.params;

    const testCaseService = createRBACExplorerTestCaseGeneratorService(userContext);
    const result = await testCaseService.runTestCase(testCaseId);

    const duration = Date.now() - startTime;

    log.info('Test case executed', {
      operation: 'run_test_case',
      userId: userContext.user_id,
      testCaseId,
      passed: result.passed,
      duration,
      component: 'api',
    });

    return createSuccessResponse(result);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to run test case', error, {
      operation: 'run_test_case',
      userId: userContext.user_id,
      duration,
      component: 'api',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to run test case',
      500,
      request
    );
  }
};

export const POST = rbacRoute(runTestCaseHandler, {
  permission: ['data-explorer:manage:all'],
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';

