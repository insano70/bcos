import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse, handleRouteError } from '@/lib/api/responses/error';
import { createRBACExplorerMetadataService } from '@/lib/services/data-explorer';
import { tableMetadataUpdateSchema } from '@/lib/validations/data-explorer';
import { log, calculateChanges } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import type { TableMetadata } from '@/lib/types/data-explorer';

const getTableHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
): Promise<Response> => {
  try {
    const { params } = args[0] as { params: Promise<{ id: string }> };
    const resolvedParams = await params;
    const id = resolvedParams.id;
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

    return handleRouteError(error, 'Failed to process data explorer request', request);
  }
};

const updateTableHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
): Promise<Response> => {
  try {
    const { params } = args[0] as { params: Promise<{ id: string }> };
    const resolvedParams = await params;
    const id = resolvedParams.id;
    const validatedData = await validateRequest(request, tableMetadataUpdateSchema);

    const metadataService = createRBACExplorerMetadataService(userContext);

    // Fetch existing table for change tracking
    const existingTable = await metadataService.getTableById(id);
    if (!existingTable) {
      return createErrorResponse('Table metadata not found', 404, request);
    }

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

    // Calculate changes for audit trail
    const changes = calculateChanges(existingTable, updateData);

    log.info('Table metadata updated', {
      operation: 'data_explorer_update_table',
      resourceType: 'data_explorer_metadata',
      resourceId: id,
      userId: userContext.user_id,
      changes,
      component: 'business-logic',
    });

    return createSuccessResponse(updated, 'Table metadata updated successfully');
  } catch (error) {
    log.error('Update table metadata failed', error as Error, {
      operation: 'data_explorer_update_table',
      userId: userContext.user_id,
      component: 'business-logic',
    });

    return handleRouteError(error, 'Failed to process data explorer request', request);
  }
};

const deleteTableHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
): Promise<Response> => {
  try {
    const { params } = args[0] as { params: Promise<{ id: string }> };
    const resolvedParams = await params;
    const id = resolvedParams.id;

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

    return handleRouteError(error, 'Failed to process data explorer request', request);
  }
};

export const GET = rbacRoute(getTableHandler, {
  permission: ['data-explorer:read:organization', 'data-explorer:read:all'],
  rateLimit: 'api',
});

export const PUT = rbacRoute(updateTableHandler, {
  permission: 'data-explorer:manage:all',
  rateLimit: 'api',
});

export const DELETE = rbacRoute(deleteTableHandler, {
  permission: 'data-explorer:manage:all',
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';

