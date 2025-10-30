import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createRBACExplorerRelationshipService } from '@/lib/services/data-explorer';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import { z } from 'zod';

const detectRelationshipsSchema = z.object({
  schema_name: z.string().default('ih'),
});

const detectRelationshipsHandler = async (
  request: NextRequest,
  userContext: UserContext
): Promise<Response> => {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { schema_name } = detectRelationshipsSchema.parse(body);

    const relationshipService = createRBACExplorerRelationshipService(userContext);
    const relationships = await relationshipService.detectRelationships(schema_name);

    const duration = Date.now() - startTime;

    log.info('Relationship detection completed', {
      operation: 'data_explorer_detect_relationships',
      resourceType: 'data_explorer_metadata',
      userId: userContext.user_id,
      duration,
      slow: duration > SLOW_THRESHOLDS.API_OPERATION,
      relationshipsFound: relationships.length,
      component: 'business-logic',
    });

    return createSuccessResponse(
      {
        relationships_detected: relationships.length,
        relationships,
      },
      'Relationship detection completed successfully'
    );
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Relationship detection failed', error as Error, {
      operation: 'data_explorer_detect_relationships',
      userId: userContext.user_id,
      duration,
      component: 'business-logic',
    });

    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map((issue) => issue.message).join(', ');
      return createErrorResponse(`Validation failed: ${errorMessages}`, 400, request);
    }

    return createErrorResponse(
      error instanceof Error ? error.message : 'Relationship detection failed',
      500,
      request
    );
  }
};

export const POST = rbacRoute(detectRelationshipsHandler, {
  permission: 'data-explorer:discovery:run:all',
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';

