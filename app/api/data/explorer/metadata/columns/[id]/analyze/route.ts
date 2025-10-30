import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createRBACExplorerColumnStatisticsService } from '@/lib/services/data-explorer';
import { analyzeColumnSchema } from '@/lib/validations/data-explorer';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

/**
 * POST /api/data/explorer/metadata/columns/[id]/analyze
 * Analyze statistics for a single column
 * Permission: data-explorer:manage:all
 */
const analyzeColumnHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
): Promise<Response> => {
  const context = args[0] as { params: Promise<{ id: string }> };
  const { id: columnId } = await context.params;
  const validatedData = await validateRequest(request, analyzeColumnSchema);

  log.info('Analyzing column statistics', {
    operation: 'analyze_column',
    columnId,
    force: validatedData.force,
    userId: userContext.user_id,
    component: 'api',
  });

  const service = createRBACExplorerColumnStatisticsService(userContext);
  const result = await service.analyzeColumn(columnId, {
    force: validatedData.force,
  });

  return createSuccessResponse(result);
};

export const POST = rbacRoute(analyzeColumnHandler, {
  permission: ['data-explorer:manage:all'],
  rateLimit: 'api',
});

