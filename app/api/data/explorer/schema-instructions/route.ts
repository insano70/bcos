import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createRBACExplorerMetadataService } from '@/lib/services/data-explorer';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import { z } from 'zod';

const getInstructionsHandler = async (
  _request: NextRequest,
  userContext: UserContext
): Promise<Response> => {
  try {
    const metadataService = createRBACExplorerMetadataService(userContext);
    const instructions = await metadataService.getSchemaInstructions('ih');

    log.info('Schema instructions retrieved', {
      operation: 'data_explorer_get_instructions',
      count: instructions.length,
      userId: userContext.user_id,
      component: 'business-logic',
    });

    return createSuccessResponse(instructions);
  } catch (error) {
    log.error('Get schema instructions failed', error as Error, {
      operation: 'data_explorer_get_instructions',
      userId: userContext.user_id,
      component: 'business-logic',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to fetch schema instructions',
      500,
      _request
    );
  }
};

const createInstructionSchema = z.object({
  title: z.string().min(1).max(200),
  instruction: z.string().min(10).max(2000),
  category: z.enum(['filtering', 'aggregation', 'joining', 'business_rule']).optional(),
  priority: z.number().int().min(1).max(3).optional(),
  example_query: z.string().max(500).optional(),
  example_sql: z.string().max(2000).optional(),
});

const createInstructionHandler = async (
  request: NextRequest,
  userContext: UserContext
): Promise<Response> => {
  try {
    const data = await validateRequest(request, createInstructionSchema);

    const metadataService = createRBACExplorerMetadataService(userContext);
    const createData = {
      title: data.title,
      instruction: data.instruction,
      ...(data.category && { category: data.category }),
      ...(data.priority !== undefined && { priority: data.priority }),
      ...(data.example_query && { example_query: data.example_query }),
      ...(data.example_sql && { example_sql: data.example_sql }),
    };
    const created = await metadataService.createSchemaInstruction(createData);

    log.info('Schema instruction created', {
      operation: 'data_explorer_create_instruction',
      instructionId: created.instruction_id,
      title: created.title,
      userId: userContext.user_id,
      component: 'business-logic',
    });

    return createSuccessResponse(created, 'Schema instruction created successfully');
  } catch (error) {
    log.error('Create schema instruction failed', error as Error, {
      operation: 'data_explorer_create_instruction',
      userId: userContext.user_id,
      component: 'business-logic',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to create schema instruction',
      500,
      request
    );
  }
};

export const GET = rbacRoute(getInstructionsHandler, {
  permission: ['data-explorer:read:organization', 'data-explorer:read:all'],
  rateLimit: 'api',
});

export const POST = rbacRoute(createInstructionHandler, {
  permission: 'data-explorer:manage:all',
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';

