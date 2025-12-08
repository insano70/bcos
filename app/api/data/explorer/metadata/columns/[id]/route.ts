import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createRBACExplorerMetadataService } from '@/lib/services/data-explorer';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import { z } from 'zod';

const updateColumnSchema = z.object({
  display_name: z.string().max(255).optional(),
  description: z.string().max(2000).optional(),
  semantic_type: z.enum(['date', 'amount', 'identifier', 'code', 'text', 'boolean']).optional(),
  is_phi: z.boolean().optional(),
});

const updateColumnHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
): Promise<Response> => {
  try {
    const { params } = args[0] as { params: Promise<{ id: string }> };
    const resolvedParams = await params;
    const id = resolvedParams.id;

    const validatedData = await validateRequest(request, updateColumnSchema);

    const metadataService = createRBACExplorerMetadataService(userContext);
    const updateData = {
      ...(validatedData.display_name !== undefined && { display_name: validatedData.display_name }),
      ...(validatedData.description !== undefined && { description: validatedData.description }),
      ...(validatedData.semantic_type !== undefined && { semantic_type: validatedData.semantic_type }),
      ...(validatedData.is_phi !== undefined && { is_phi: validatedData.is_phi }),
    };
    const updated = await metadataService.updateColumnMetadata(id, updateData);

    // Note: Change tracking requires getColumnById method to be added to ExplorerMetadataService
    log.info('Column metadata updated', {
      operation: 'data_explorer_update_column',
      resourceType: 'data_explorer_metadata',
      resourceId: id,
      userId: userContext.user_id,
      fieldsUpdated: Object.keys(updateData),
      component: 'business-logic',
    });

    return createSuccessResponse(updated, 'Column metadata updated successfully');
  } catch (error) {
    log.error('Update column metadata failed', error as Error, {
      operation: 'data_explorer_update_column',
      userId: userContext.user_id,
      component: 'business-logic',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to update column metadata',
      500,
      request
    );
  }
};

export const PUT = rbacRoute(updateColumnHandler, {
  permission: 'data-explorer:manage:all',
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';

