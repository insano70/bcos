import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { handleRouteError, NotFoundError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractRouteParams } from '@/lib/api/utils/params';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { calculateChanges, log, logTemplates } from '@/lib/logger';
import { createRBACWorkItemStatusesService } from '@/lib/services/rbac-work-item-statuses-service';
import type { UserContext } from '@/lib/types/rbac';

/**
 * GET /api/work-item-statuses/[id]
 * Get a single work item status by ID
 */
const getStatusHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const { workItemStatusParamsSchema } = await import('@/lib/validations/work-items');
    const { id } = await extractRouteParams(args[0], workItemStatusParamsSchema);

    const statusesService = createRBACWorkItemStatusesService(userContext);
    const status = await statusesService.getStatusById(id);

    if (!status) {
      const template = logTemplates.crud.read('work_item_status', {
        resourceId: String(id),
        found: false,
        userId: userContext.user_id,
        duration: Date.now() - startTime,
      });
      log.info(template.message, template.context);
      throw NotFoundError('Work item status');
    }

    const duration = Date.now() - startTime;
    const template = logTemplates.crud.read('work_item_status', {
      resourceId: String(status.work_item_status_id),
      resourceName: status.status_name,
      found: true,
      userId: userContext.user_id,
      duration,
      metadata: {
        workItemTypeId: status.work_item_type_id,
        category: status.status_category,
        isInitial: status.is_initial,
        isFinal: status.is_final,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse({
      id: status.work_item_status_id,
      work_item_type_id: status.work_item_type_id,
      status_name: status.status_name,
      status_category: status.status_category,
      is_initial: status.is_initial,
      is_final: status.is_final,
      color: status.color,
      display_order: status.display_order,
      created_at: status.created_at,
      updated_at: status.updated_at,
    });
  } catch (error) {
    log.error('work item status read failed', error, {
      operation: 'read_work_item_status',
      userId: userContext.user_id,
      component: 'work-items',
    });

    return handleRouteError(error, 'Failed to get work item status', request);
  }
};

export const GET = rbacRoute(getStatusHandler, {
  permission: 'work-items:read:organization',
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

/**
 * PATCH /api/work-item-statuses/[id]
 * Update a work item status
 */
const updateStatusHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const { workItemStatusParamsSchema, workItemStatusUpdateSchema } = await import(
      '@/lib/validations/work-items'
    );
    const { id } = await extractRouteParams(args[0], workItemStatusParamsSchema);

    const validatedData = await validateRequest(request, workItemStatusUpdateSchema);

    // Get before state and filter undefined values
    const statusesService = createRBACWorkItemStatusesService(userContext);
    const before = await statusesService.getStatusById(id);

    if (!before) {
      throw NotFoundError('Work item status');
    }

    const filteredData: {
      status_name?: string;
      status_category?: string;
      is_initial?: boolean;
      is_final?: boolean;
      color?: string | null;
      display_order?: number;
    } = {};
    if (validatedData.status_name !== undefined)
      filteredData.status_name = validatedData.status_name;
    if (validatedData.status_category !== undefined)
      filteredData.status_category = validatedData.status_category;
    if (validatedData.is_initial !== undefined) filteredData.is_initial = validatedData.is_initial;
    if (validatedData.is_final !== undefined) filteredData.is_final = validatedData.is_final;
    if (validatedData.color !== undefined) filteredData.color = validatedData.color;
    if (validatedData.display_order !== undefined)
      filteredData.display_order = validatedData.display_order;

    const updatedStatus = await statusesService.updateStatus(id, filteredData);

    const duration = Date.now() - startTime;
    const changes = calculateChanges(
      {
        status_name: before.status_name,
        status_category: before.status_category,
        is_initial: before.is_initial,
        is_final: before.is_final,
        color: before.color,
        display_order: before.display_order,
      },
      {
        status_name: updatedStatus.status_name,
        status_category: updatedStatus.status_category,
        is_initial: updatedStatus.is_initial,
        is_final: updatedStatus.is_final,
        color: updatedStatus.color,
        display_order: updatedStatus.display_order,
      }
    );

    const template = logTemplates.crud.update('work_item_status', {
      resourceId: String(updatedStatus.work_item_status_id),
      resourceName: updatedStatus.status_name,
      userId: userContext.user_id,
      changes,
      duration,
      metadata: {
        workItemTypeId: updatedStatus.work_item_type_id,
        category: updatedStatus.status_category,
        isInitial: updatedStatus.is_initial,
        isFinal: updatedStatus.is_final,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse({
      id: updatedStatus.work_item_status_id,
      work_item_type_id: updatedStatus.work_item_type_id,
      status_name: updatedStatus.status_name,
      status_category: updatedStatus.status_category,
      is_initial: updatedStatus.is_initial,
      is_final: updatedStatus.is_final,
      color: updatedStatus.color,
      display_order: updatedStatus.display_order,
      created_at: updatedStatus.created_at,
      updated_at: updatedStatus.updated_at,
    });
  } catch (error) {
    log.error('work item status update failed', error, {
      operation: 'update_work_item_status',
      userId: userContext.user_id,
      component: 'work-items',
    });

    return handleRouteError(error, 'Failed to update work item status', request);
  }
};

export const PATCH = rbacRoute(updateStatusHandler, {
  permission: 'work-items:manage:organization',
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

/**
 * DELETE /api/work-item-statuses/[id]
 * Delete a work item status
 */
const deleteStatusHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const { workItemStatusParamsSchema } = await import('@/lib/validations/work-items');
    const { id } = await extractRouteParams(args[0], workItemStatusParamsSchema);

    const statusesService = createRBACWorkItemStatusesService(userContext);
    const status = await statusesService.getStatusById(id);

    if (!status) {
      throw NotFoundError('Work item status');
    }

    await statusesService.deleteStatus(id);

    const duration = Date.now() - startTime;
    const template = logTemplates.crud.delete('work_item_status', {
      resourceId: String(status.work_item_status_id),
      resourceName: status.status_name,
      userId: userContext.user_id,
      soft: false,
      duration,
      metadata: {
        workItemTypeId: status.work_item_type_id,
        category: status.status_category,
        wasInitial: status.is_initial,
        wasFinal: status.is_final,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse({
      message: 'Work item status deleted successfully',
      id,
    });
  } catch (error) {
    log.error('work item status deletion failed', error, {
      operation: 'delete_work_item_status',
      userId: userContext.user_id,
      component: 'work-items',
    });

    return handleRouteError(error, 'Failed to delete work item status', request);
  }
};

export const DELETE = rbacRoute(deleteStatusHandler, {
  permission: 'work-items:manage:organization',
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
