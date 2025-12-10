import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse, handleRouteError } from '@/lib/api/responses/error';
import {
  createRBACExplorerQueryExecutorService,
  createRBACExplorerHistoryService,
} from '@/lib/services/data-explorer';
import { executeQuerySchema } from '@/lib/validations/data-explorer';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

const executeQueryHandler = async (
  request: NextRequest,
  userContext: UserContext
): Promise<Response> => {
  const startTime = Date.now();

  try {
    const validatedData = await validateRequest(request, executeQuerySchema);

    const queryExecutor = createRBACExplorerQueryExecutorService(userContext);

    const validation = await queryExecutor.validateSQL(validatedData.sql);
    if (!validation.isValid) {
      return createErrorResponse(
        `SQL validation failed: ${validation.errors.join(', ')}`,
        400,
        request
      );
    }

    const result = await queryExecutor.execute(validatedData.sql, {
      limit: validatedData.limit ?? undefined,
      timeout_ms: validatedData.timeout_ms ?? undefined,
      dry_run: validatedData.dry_run ?? undefined,
    });

    if (validatedData.query_history_id) {
      const historyService = createRBACExplorerHistoryService(userContext);
      await historyService.updateHistoryEntry(validatedData.query_history_id, {
        status: 'success',
        final_sql: validatedData.sql,
        execution_time_ms: result.execution_time_ms,
        row_count: result.row_count,
        result_sample: result.rows.slice(0, 10),
      });
    }

    const duration = Date.now() - startTime;

    log.info('Query executed successfully', {
      operation: 'data_explorer_execute_query',
      resourceType: 'data_explorer_query',
      userId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      duration,
      slow: duration > SLOW_THRESHOLDS.API_OPERATION,
      executionTime: result.execution_time_ms,
      rowCount: result.row_count,
      component: 'business-logic',
    });

    return createSuccessResponse(result, 'Query executed successfully');
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Query execution failed', error as Error, {
      operation: 'data_explorer_execute_query',
      userId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      duration,
      component: 'business-logic',
    });

    // Note: validatedData may be undefined if error occurred during validation
    // Skip history update in that case

    return handleRouteError(error, 'Query execution failed', request);
  }
};

export const POST = rbacRoute(executeQueryHandler, {
  permission: [
    'data-explorer:execute:own',
    'data-explorer:execute:organization',
    'data-explorer:execute:all',
  ],
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';

