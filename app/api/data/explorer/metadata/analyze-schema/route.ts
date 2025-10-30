import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createRBACExplorerColumnStatisticsService } from '@/lib/services/data-explorer';
import { analyzeSchemaSchema } from '@/lib/validations/data-explorer';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';

export const maxDuration = 300; // 5 minutes for long-running analysis

/**
 * POST /api/data/explorer/metadata/analyze-schema
 * Analyze statistics for columns across the entire schema (resumable)
 * Permission: data-explorer:manage:all
 */
const analyzeSchemaHandler = async (
  request: NextRequest,
  userContext: UserContext
): Promise<Response> => {
  const validatedData = await validateRequest(request, analyzeSchemaSchema);

  log.info('Analyzing schema column statistics', {
    operation: 'analyze_schema_columns',
    tiers: validatedData.tiers,
    limit: validatedData.limit,
    force: validatedData.force,
    resume: validatedData.resume,
    userId: userContext.user_id,
    component: 'api',
  });

  const service = createRBACExplorerColumnStatisticsService(userContext);
  
  // Build options object conditionally to satisfy exactOptionalPropertyTypes
  const options: Parameters<typeof service.analyzeSchemaColumns>[1] = {
    force: validatedData.force,
    resume: validatedData.resume,
  };
  
  if (validatedData.tiers !== undefined) {
    options.tiers = validatedData.tiers;
  }
  
  if (validatedData.limit !== undefined) {
    options.limit = validatedData.limit;
  }

  const result = await service.analyzeSchemaColumns('ih', options);

  return createSuccessResponse(result);
};

export const POST = rbacRoute(analyzeSchemaHandler, {
  permission: ['data-explorer:manage:all'],
  rateLimit: 'api',
});

