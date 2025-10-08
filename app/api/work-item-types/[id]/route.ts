import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse, NotFoundError } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { extractRouteParams } from '@/lib/api/utils/params';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createRBACWorkItemTypesService } from '@/lib/services/rbac-work-item-types-service';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

/**
 * GET /api/work-item-types/[id]
 * Get a single work item type by ID
 */
const getWorkItemTypeHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const { workItemTypeParamsSchema } = await import('@/lib/validations/work-items');
    const { id } = await extractRouteParams(args[0], workItemTypeParamsSchema);

    log.info('Get work item type request initiated', {
      operation: 'get_work_item_type',
      requestingUserId: userContext.user_id,
      typeId: id,
    });

    // Create RBAC service
    const workItemTypesService = createRBACWorkItemTypesService(userContext);

    // Get work item type
    const queryStart = Date.now();
    const workItemType = await workItemTypesService.getWorkItemTypeById(id);
    log.db('SELECT', 'work_item_types', Date.now() - queryStart, {
      rowCount: workItemType ? 1 : 0,
    });

    if (!workItemType) {
      throw NotFoundError('Work item type');
    }

    const totalDuration = Date.now() - startTime;
    log.info('Work item type retrieved successfully', {
      typeId: id,
      totalDuration,
    });

    return createSuccessResponse({
      id: workItemType.work_item_type_id,
      organization_id: workItemType.organization_id,
      organization_name: workItemType.organization_name,
      name: workItemType.name,
      description: workItemType.description,
      icon: workItemType.icon,
      color: workItemType.color,
      is_active: workItemType.is_active,
      created_by: workItemType.created_by,
      created_by_name: workItemType.created_by_name,
      created_at: workItemType.created_at,
      updated_at: workItemType.updated_at,
    });
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    log.error('Get work item type request failed', error, { totalDuration });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      error instanceof NotFoundError ? 404 : 500,
      request
    );
  }
};

export const GET = rbacRoute(getWorkItemTypeHandler, {
  permission: 'work-items:read:organization',
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

/**
 * PATCH /api/work-item-types/[id]
 * Update a work item type
 */
const updateWorkItemTypeHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const { workItemTypeParamsSchema, workItemTypeUpdateSchema } = await import(
      '@/lib/validations/work-items'
    );
    const { id } = await extractRouteParams(args[0], workItemTypeParamsSchema);

    log.info('Update work item type request initiated', {
      operation: 'update_work_item_type',
      requestingUserId: userContext.user_id,
      typeId: id,
    });

    // Validate body
    const validatedData = await validateRequest(request, workItemTypeUpdateSchema);

    // Create RBAC service
    const workItemTypesService = createRBACWorkItemTypesService(userContext);

    // Update work item type (filter out undefined values)
    const updateStart = Date.now();
    const filteredData: {
      name?: string;
      description?: string | null;
      icon?: string | null;
      color?: string | null;
      is_active?: boolean;
    } = {};
    if (validatedData.name !== undefined) filteredData.name = validatedData.name;
    if (validatedData.description !== undefined) filteredData.description = validatedData.description;
    if (validatedData.icon !== undefined) filteredData.icon = validatedData.icon;
    if (validatedData.color !== undefined) filteredData.color = validatedData.color;
    if (validatedData.is_active !== undefined) filteredData.is_active = validatedData.is_active;

    const updatedType = await workItemTypesService.updateWorkItemType(id, filteredData);
    log.db('UPDATE', 'work_item_types', Date.now() - updateStart, { rowCount: 1 });

    const totalDuration = Date.now() - startTime;
    log.info('Work item type updated successfully', {
      typeId: id,
      totalDuration,
    });

    return createSuccessResponse({
      id: updatedType.work_item_type_id,
      organization_id: updatedType.organization_id,
      organization_name: updatedType.organization_name,
      name: updatedType.name,
      description: updatedType.description,
      icon: updatedType.icon,
      color: updatedType.color,
      is_active: updatedType.is_active,
      created_by: updatedType.created_by,
      created_by_name: updatedType.created_by_name,
      created_at: updatedType.created_at,
      updated_at: updatedType.updated_at,
    });
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    log.error('Update work item type request failed', error, { totalDuration });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

export const PATCH = rbacRoute(updateWorkItemTypeHandler, {
  permission: 'work-items:manage:organization',
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

/**
 * DELETE /api/work-item-types/[id]
 * Delete a work item type (soft delete)
 */
const deleteWorkItemTypeHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const { workItemTypeParamsSchema } = await import('@/lib/validations/work-items');
    const { id } = await extractRouteParams(args[0], workItemTypeParamsSchema);

    log.info('Delete work item type request initiated', {
      operation: 'delete_work_item_type',
      requestingUserId: userContext.user_id,
      typeId: id,
    });

    // Create RBAC service
    const workItemTypesService = createRBACWorkItemTypesService(userContext);

    // Delete work item type
    const deleteStart = Date.now();
    await workItemTypesService.deleteWorkItemType(id);
    log.db('UPDATE', 'work_item_types', Date.now() - deleteStart, { rowCount: 1 });

    const totalDuration = Date.now() - startTime;
    log.info('Work item type deleted successfully', {
      typeId: id,
      totalDuration,
    });

    return createSuccessResponse({
      message: 'Work item type deleted successfully',
      id,
    });
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    log.error('Delete work item type request failed', error, { totalDuration });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

export const DELETE = rbacRoute(deleteWorkItemTypeHandler, {
  permission: 'work-items:manage:organization',
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
