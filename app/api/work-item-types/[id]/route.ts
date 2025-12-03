import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createErrorResponse, getErrorStatusCode, NotFoundError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractRouteParams } from '@/lib/api/utils/params';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { calculateChanges, log, logTemplates } from '@/lib/logger';
import { createRBACWorkItemTypesService } from '@/lib/services/rbac-work-item-types-service';
import type { UserContext } from '@/lib/types/rbac';

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

    const workItemTypesService = createRBACWorkItemTypesService(userContext);
    const workItemType = await workItemTypesService.getWorkItemTypeById(id);

    if (!workItemType) {
      const template = logTemplates.crud.read('work_item_type', {
        resourceId: String(id),
        found: false,
        userId: userContext.user_id,
        duration: Date.now() - startTime,
      });
      log.info(template.message, template.context);
      throw NotFoundError('Work item type');
    }

    const duration = Date.now() - startTime;
    const template = logTemplates.crud.read('work_item_type', {
      resourceId: String(workItemType.work_item_type_id),
      resourceName: workItemType.name,
      found: true,
      userId: userContext.user_id,
      duration,
      metadata: {
        organizationId: workItemType.organization_id,
        isActive: workItemType.is_active,
      },
    });
    log.info(template.message, template.context);

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
    log.error('work item type read failed', error, {
      operation: 'read_work_item_type',
      userId: userContext.user_id,
      component: 'work-items',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      getErrorStatusCode(error),
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

    // Validate body
    const validatedData = await validateRequest(request, workItemTypeUpdateSchema);

    // Create RBAC service and get before state
    const workItemTypesService = createRBACWorkItemTypesService(userContext);
    const before = await workItemTypesService.getWorkItemTypeById(id);

    if (!before) {
      throw NotFoundError('Work item type');
    }

    // Update work item type (filter out undefined values)
    const filteredData: {
      name?: string;
      description?: string | null;
      icon?: string | null;
      color?: string | null;
      is_active?: boolean;
    } = {};
    if (validatedData.name !== undefined) filteredData.name = validatedData.name;
    if (validatedData.description !== undefined)
      filteredData.description = validatedData.description;
    if (validatedData.icon !== undefined) filteredData.icon = validatedData.icon;
    if (validatedData.color !== undefined) filteredData.color = validatedData.color;
    if (validatedData.is_active !== undefined) filteredData.is_active = validatedData.is_active;

    const updatedType = await workItemTypesService.updateWorkItemType(id, filteredData);

    const duration = Date.now() - startTime;
    const changes = calculateChanges(
      {
        name: before.name,
        description: before.description,
        icon: before.icon,
        color: before.color,
        is_active: before.is_active,
      },
      {
        name: updatedType.name,
        description: updatedType.description,
        icon: updatedType.icon,
        color: updatedType.color,
        is_active: updatedType.is_active,
      }
    );

    const template = logTemplates.crud.update('work_item_type', {
      resourceId: String(updatedType.work_item_type_id),
      resourceName: updatedType.name,
      userId: userContext.user_id,
      changes,
      duration,
      metadata: {
        organizationId: updatedType.organization_id,
        isActive: updatedType.is_active,
      },
    });

    log.info(template.message, template.context);

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
    log.error('work item type update failed', error, {
      operation: 'update_work_item_type',
      userId: userContext.user_id,
      component: 'work-items',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      getErrorStatusCode(error),
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

    // Create RBAC service and get work item type before deletion
    const workItemTypesService = createRBACWorkItemTypesService(userContext);
    const workItemType = await workItemTypesService.getWorkItemTypeById(id);

    if (!workItemType) {
      throw NotFoundError('Work item type');
    }

    // Delete work item type
    await workItemTypesService.deleteWorkItemType(id);

    const duration = Date.now() - startTime;
    const template = logTemplates.crud.delete('work_item_type', {
      resourceId: String(workItemType.work_item_type_id),
      resourceName: workItemType.name,
      userId: userContext.user_id,
      soft: true,
      duration,
      metadata: {
        organizationId: workItemType.organization_id,
        wasActive: workItemType.is_active,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse({
      message: 'Work item type deleted successfully',
      id,
    });
  } catch (error) {
    log.error('work item type deletion failed', error, {
      operation: 'delete_work_item_type',
      userId: userContext.user_id,
      component: 'work-items',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      getErrorStatusCode(error),
      request
    );
  }
};

export const DELETE = rbacRoute(deleteWorkItemTypeHandler, {
  permission: 'work-items:manage:organization',
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
