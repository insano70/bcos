import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createRBACExplorerTestCaseGeneratorService } from '@/lib/services/data-explorer';
import { log } from '@/lib/logger';
import { z } from 'zod';
import type { UserContext } from '@/lib/types/rbac';

const generateTestCasesSchema = z.object({
  limit: z.number().int().min(1).max(100).default(50),
});

const generateTestCasesHandler = async (
  request: NextRequest,
  userContext: UserContext
): Promise<Response> => {
  const startTime = Date.now();

  try {
    const validatedData = await validateRequest(request, generateTestCasesSchema);

    const testCaseService = createRBACExplorerTestCaseGeneratorService(userContext);
    const testCases = await testCaseService.generateTestCasesFromResolvedFeedback(
      validatedData.limit
    );

    const duration = Date.now() - startTime;

    log.info('Test cases generated', {
      operation: 'generate_test_cases',
      userId: userContext.user_id,
      count: testCases.length,
      duration,
      component: 'api',
    });

    return createSuccessResponse(testCases, `Generated ${testCases.length} test cases`);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to generate test cases', error, {
      operation: 'generate_test_cases',
      userId: userContext.user_id,
      duration,
      component: 'api',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to generate test cases',
      500,
      request
    );
  }
};

export const POST = rbacRoute(generateTestCasesHandler, {
  permission: ['data-explorer:manage:all'],
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';

