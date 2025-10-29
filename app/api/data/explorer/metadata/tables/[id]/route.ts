import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createRBACExplorerMetadataService } from '@/lib/services/data-explorer';
import { tableMetadataUpdateSchema } from '@/lib/validations/data-explorer';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import type { TableMetadata } from '@/lib/types/data-explorer';

const getTableHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
): Promise<Response> => {
  try {
    const params = (args[0] as { params: { id: string } }).params;
    const id = params.id;
    const metadataService = createRBACExplorerMetadataService(userContext);
    const metadata = await metadataService.getTableById(id);

    if (!metadata) {
      return createErrorResponse('Table metadata not found', 404, request);
    }

    return createSuccessResponse(metadata);
  } catch (error) {
    log.error('Get table metadata failed', error as Error, {
      operation: 'data_explorer_get_table',
      userId: userContext.user_id,
      component: 'business-logic',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to fetch table metadata',
      500,
      request
    );
  }
};

const updateTableHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
): Promise<Response> => {
  try {
    const params = (args[0] as { params: { id: string } }).params;
    const id = params.id;
    const validatedData = await validateRequest(request, tableMetadataUpdateSchema);

    const metadataService = createRBACExplorerMetadataService(userContext);
    const updateData: Partial<TableMetadata> = {
      ...(validatedData.display_name !== undefined && { display_name: validatedData.display_name }),
      ...(validatedData.description !== undefined && { description: validatedData.description }),
      ...(validatedData.row_meaning !== undefined && { row_meaning: validatedData.row_meaning }),
      ...(validatedData.tier !== undefined && { tier: validatedData.tier as 1 | 2 | 3 }),
      ...(validatedData.tags !== undefined && { tags: validatedData.tags }),
      ...(validatedData.is_active !== undefined && { is_active: validatedData.is_active }),
      ...(validatedData.sample_questions !== undefined && { sample_questions: validatedData.sample_questions }),
      ...(validatedData.common_filters !== undefined && { common_filters: validatedData.common_filters }),
      ...(validatedData.common_joins !== undefined && { common_joins: validatedData.common_joins }),
    };
    const updated = await metadataService.updateTableMetadata(id, updateData);

    log.info('Table metadata updated', {
      operation: 'data_explorer_update_table',
      resourceType: 'data_explorer_metadata',
      resourceId: id,
      userId: userContext.user_id,
      component: 'business-logic',
    });

    return createSuccessResponse(updated, 'Table metadata updated successfully');
  } catch (error) {
    log.error('Update table metadata failed', error as Error, {
      operation: 'data_explorer_update_table',
      userId: userContext.user_id,
      component: 'business-logic',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to update table metadata',
      500,
      request
    );
  }
};

const deleteTableHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
): Promise<Response> => {
  try {
    const params = (args[0] as { params: { id: string } }).params;
    const id = params.id;

    const metadataService = createRBACExplorerMetadataService(userContext);
    await metadataService.deleteTableMetadata(id);

    log.info('Table metadata deleted', {
      operation: 'data_explorer_delete_table_metadata',
      resourceType: 'data_explorer_metadata',
      resourceId: id,
      userId: userContext.user_id,
      component: 'business-logic',
    });

    return createSuccessResponse({ deleted: true }, 'Table metadata deleted successfully');
  } catch (error) {
    log.error('Delete table metadata failed', error as Error, {
      operation: 'data_explorer_delete_table_metadata',
      userId: userContext.user_id,
      component: 'business-logic',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Failed to delete table metadata',
      500,
      request
    );
  }
};

export const GET = rbacRoute(getTableHandler, {
  permission: ['data-explorer:metadata:read:organization', 'data-explorer:metadata:read:all'],
  rateLimit: 'api',
});

export const PUT = rbacRoute(updateTableHandler, {
  permission: 'data-explorer:metadata:manage:all',
  rateLimit: 'api',
});

export const DELETE = rbacRoute(deleteTableHandler, {
  permission: 'data-explorer:metadata:manage:all',
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';

