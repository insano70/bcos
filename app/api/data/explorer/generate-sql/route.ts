import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import {
  createRBACExplorerBedrockService,
  createRBACExplorerHistoryService,
} from '@/lib/services/data-explorer';
import { generateSQLSchema } from '@/lib/validations/data-explorer';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

const generateSQLHandler = async (
  request: NextRequest,
  userContext: UserContext
): Promise<Response> => {
  const startTime = Date.now();

  try {
    const validatedData = await validateRequest(request, generateSQLSchema);

    const bedrockService = createRBACExplorerBedrockService(userContext);
    const historyService = createRBACExplorerHistoryService(userContext);

    const result = await bedrockService.generateSQL(validatedData.natural_language_query, {
      model: validatedData.model,
      temperature: validatedData.temperature,
      include_explanation: validatedData.include_explanation,
      tiers: validatedData.tiers,
    });

    const historyEntry = await historyService.createHistoryEntry({
      natural_language_query: validatedData.natural_language_query,
      generated_sql: result.sql,
      status: 'generated',
      model_used: result.model_used,
      prompt_tokens: result.prompt_tokens,
      completion_tokens: result.completion_tokens,
      tables_used: result.tables_used,
      user_id: userContext.user_id,
      user_email: userContext.email,
      organization_id: userContext.current_organization_id ?? null,
    });

    const duration = Date.now() - startTime;

    log.info('SQL generation completed', {
      operation: 'data_explorer_generate_sql',
      resourceType: 'data_explorer_query',
      userId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      queryLength: validatedData.natural_language_query.length,
      duration,
      slow: duration > SLOW_THRESHOLDS.API_OPERATION,
      model: result.model_used,
      tokensUsed: result.prompt_tokens + result.completion_tokens,
      tablesUsed: result.tables_used,
      complexity: result.estimated_complexity,
      historyId: historyEntry.query_history_id,
      component: 'business-logic',
    });

    return createSuccessResponse(
      {
        ...result,
        query_history_id: historyEntry.query_history_id,
      },
      'SQL generated successfully'
    );
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('SQL generation failed', error as Error, {
      operation: 'data_explorer_generate_sql',
      userId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      duration,
      component: 'business-logic',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'SQL generation failed',
      500,
      request
    );
  }
};

export const POST = rbacRoute(generateSQLHandler, {
  permission: ['data-explorer:query:organization', 'data-explorer:query:all'],
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';

