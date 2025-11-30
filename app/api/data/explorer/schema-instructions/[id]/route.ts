import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createRBACExplorerMetadataService } from '@/lib/services/data-explorer';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import { z } from 'zod';

const updateInstructionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  instruction: z.string().min(10).max(2000).optional(),
  category: z.enum(['filtering', 'aggregation', 'joining', 'business_rule']).optional(),
  priority: z.number().int().min(1).max(3).optional(),
  is_active: z.boolean().optional(),
  example_query: z.string().max(500).optional(),
  example_sql: z.string().max(2000).optional(),
});

const updateInstructionHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
): Promise<Response> => {
  try {
    const params = (args[0] as { params: { id: string } }).params;
    const id = params.id;
    const data = await validateRequest(request, updateInstructionSchema);

    const metadataService = createRBACExplorerMetadataService(userContext);
    const updateData = {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.instruction !== undefined && { instruction: data.instruction }),
      ...(data.category !== undefined && { category: data.category }),
      ...(data.priority !== undefined && { priority: data.priority }),
      ...(data.is_active !== undefined && { is_active: data.is_active }),
      ...(data.example_query !== undefined && { example_query: data.example_query }),
      ...(data.example_sql !== undefined && { example_sql: data.example_sql }),
    };
    const updated = await metadataService.updateSchemaInstruction(id, updateData);

    // Note: Change tracking requires getSchemaInstructionById method to be added to ExplorerMetadataService
    log.info('Schema instruction updated', {
      operation: 'data_explorer_update_instruction',
      instructionId: id,
      userId: userContext.user_id,
      fieldsUpdated: Object.keys(updateData),
      component: 'business-logic',
    });

    return createSuccessResponse(updated, 'Schema instruction updated successfully');
  } catch (error) {
    log.error('Update schema instruction failed', error as Error, {
      operation: 'data_explorer_update_instruction',
      userId: userContext.user_id,
      component: 'business-logic',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to update schema instruction',
      500,
      request
    );
  }
};

const deleteInstructionHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
): Promise<Response> => {
  try {
    const params = (args[0] as { params: { id: string } }).params;
    const id = params.id;

    const metadataService = createRBACExplorerMetadataService(userContext);
    await metadataService.deleteSchemaInstruction(id);

    log.info('Schema instruction deleted', {
      operation: 'data_explorer_delete_instruction',
      instructionId: id,
      userId: userContext.user_id,
      component: 'business-logic',
    });

    return createSuccessResponse({ deleted: true }, 'Schema instruction deleted successfully');
  } catch (error) {
    log.error('Delete schema instruction failed', error as Error, {
      operation: 'data_explorer_delete_instruction',
      userId: userContext.user_id,
      component: 'business-logic',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to delete schema instruction',
      500,
      request
    );
  }
};

export const PUT = rbacRoute(updateInstructionHandler, {
  permission: 'data-explorer:manage:all',
  rateLimit: 'api',
});

export const DELETE = rbacRoute(deleteInstructionHandler, {
  permission: 'data-explorer:manage:all',
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';

