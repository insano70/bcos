import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createRBACExplorerSchemaDiscoveryService } from '@/lib/services/data-explorer';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import { z } from 'zod';

const discoverSchemaSchema = z.object({
  schema_name: z.string().default('ih'),
  limit: z.coerce.number().int().min(1).max(10000).default(1000),
});

const discoverSchemaHandler = async (
  request: NextRequest,
  userContext: UserContext
): Promise<Response> => {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { schema_name, limit } = discoverSchemaSchema.parse(body);

    const discoveryService = createRBACExplorerSchemaDiscoveryService(userContext);
    const result = await discoveryService.discoverTables(schema_name, limit);

    const duration = Date.now() - startTime;

    log.info('Schema discovery completed', {
      operation: 'data_explorer_discover_schema',
      resourceType: 'data_explorer_metadata',
      userId: userContext.user_id,
      duration,
      slow: duration > SLOW_THRESHOLDS.API_OPERATION,
      tablesDiscovered: result.tables_discovered,
      tablesNew: result.tables_new,
      component: 'business-logic',
    });

    return createSuccessResponse(result, 'Schema discovery completed successfully');
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Schema discovery failed', error as Error, {
      operation: 'data_explorer_discover_schema',
      userId: userContext.user_id,
      duration,
      component: 'business-logic',
    });

    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map((issue) => issue.message).join(', ');
      return createErrorResponse(`Validation failed: ${errorMessages}`, 400, request);
    }

    return createErrorResponse(
      error instanceof Error ? error.message : 'Schema discovery failed',
      500,
      request
    );
  }
};

export const POST = rbacRoute(discoverSchemaHandler, {
  permission: 'data-explorer:discovery:run:all',
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';

