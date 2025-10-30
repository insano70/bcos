import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createRBACExplorerColumnStatisticsService } from '@/lib/services/data-explorer';
import { analyzeTableColumnsSchema } from '@/lib/validations/data-explorer';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

/**
 * POST /api/data/explorer/metadata/tables/[id]/analyze-columns
 * Analyze statistics for all columns in a table (resumable)
 * Permission: data-explorer:manage:all
 */
const analyzeTableColumnsHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
): Promise<Response> => {
  const context = args[0] as { params: Promise<{ id: string }> };
  const { id: tableId } = await context.params;
  const validatedData = await validateRequest(request, analyzeTableColumnsSchema);

  log.info('Analyzing table column statistics', {
    operation: 'analyze_table_columns',
    tableId,
    force: validatedData.force,
    resume: validatedData.resume,
    userId: userContext.user_id,
    component: 'api',
  });

  const service = createRBACExplorerColumnStatisticsService(userContext);
  const result = await service.analyzeTableColumns(tableId, {
    force: validatedData.force,
    resume: validatedData.resume,
  });

  return createSuccessResponse(result);
};

export const POST = rbacRoute(analyzeTableColumnsHandler, {
  permission: ['data-explorer:manage:all'],
  rateLimit: 'api',
});

