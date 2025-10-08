import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse, NotFoundError } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { extractRouteParams } from '@/lib/api/utils/params';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createRBACWorkItemStatusesService } from '@/lib/services/rbac-work-item-statuses-service';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

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

    log.info('Get work item status request initiated', {
      operation: 'get_work_item_status',
      requestingUserId: userContext.user_id,
      statusId: id,
    });

    const statusesService = createRBACWorkItemStatusesService(userContext);

    const queryStart = Date.now();
    const status = await statusesService.getStatusById(id);
    log.db('SELECT', 'work_item_statuses', Date.now() - queryStart, {
      rowCount: status ? 1 : 0,
    });

    if (!status) {
      throw NotFoundError('Work item status');
    }

    const totalDuration = Date.now() - startTime;
    log.info('Work item status retrieved successfully', {
      statusId: id,
      totalDuration,
    });

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
    const totalDuration = Date.now() - startTime;
    log.error('Get work item status request failed', error, { totalDuration });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      error instanceof NotFoundError ? 404 : 500,
      request
    );
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

    log.info('Update work item status request initiated', {
      operation: 'update_work_item_status',
      requestingUserId: userContext.user_id,
      statusId: id,
    });

    const validatedData = await validateRequest(request, workItemStatusUpdateSchema);

    // Filter undefined values
    const filteredData: {
      status_name?: string;
      status_category?: string;
      is_initial?: boolean;
      is_final?: boolean;
      color?: string | null;
      display_order?: number;
    } = {};
    if (validatedData.status_name !== undefined) filteredData.status_name = validatedData.status_name;
    if (validatedData.status_category !== undefined)
      filteredData.status_category = validatedData.status_category;
    if (validatedData.is_initial !== undefined) filteredData.is_initial = validatedData.is_initial;
    if (validatedData.is_final !== undefined) filteredData.is_final = validatedData.is_final;
    if (validatedData.color !== undefined) filteredData.color = validatedData.color;
    if (validatedData.display_order !== undefined)
      filteredData.display_order = validatedData.display_order;

    const statusesService = createRBACWorkItemStatusesService(userContext);

    const updateStart = Date.now();
    const updatedStatus = await statusesService.updateStatus(id, filteredData);
    log.db('UPDATE', 'work_item_statuses', Date.now() - updateStart, { rowCount: 1 });

    const totalDuration = Date.now() - startTime;
    log.info('Work item status updated successfully', {
      statusId: id,
      totalDuration,
    });

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
    const totalDuration = Date.now() - startTime;
    log.error('Update work item status request failed', error, { totalDuration });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
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

    log.info('Delete work item status request initiated', {
      operation: 'delete_work_item_status',
      requestingUserId: userContext.user_id,
      statusId: id,
    });

    const statusesService = createRBACWorkItemStatusesService(userContext);

    const deleteStart = Date.now();
    await statusesService.deleteStatus(id);
    log.db('DELETE', 'work_item_statuses', Date.now() - deleteStart, { rowCount: 1 });

    const totalDuration = Date.now() - startTime;
    log.info('Work item status deleted successfully', {
      statusId: id,
      totalDuration,
    });

    return createSuccessResponse({
      message: 'Work item status deleted successfully',
      id,
    });
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    log.error('Delete work item status request failed', error, { totalDuration });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

export const DELETE = rbacRoute(deleteStatusHandler, {
  permission: 'work-items:manage:organization',
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
