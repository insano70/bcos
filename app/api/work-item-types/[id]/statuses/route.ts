import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractRouteParams } from '@/lib/api/utils/params';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { log } from '@/lib/logger';
import { createRBACWorkItemStatusesService } from '@/lib/services/rbac-work-item-statuses-service';
import type { UserContext } from '@/lib/types/rbac';

/**
 * GET /api/work-item-types/[id]/statuses
 * List all statuses for a work item type
 */
const getStatusesHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const { workItemTypeParamsSchema } = await import('@/lib/validations/work-items');
    const { id: typeId } = await extractRouteParams(args[0], workItemTypeParamsSchema);

    log.info('Get work item statuses request initiated', {
      operation: 'get_work_item_statuses',
      requestingUserId: userContext.user_id,
      typeId,
    });

    const statusesService = createRBACWorkItemStatusesService(userContext);

    const queryStart = Date.now();
    const statuses = await statusesService.getStatusesByType(typeId);
    log.db('SELECT', 'work_item_statuses', Date.now() - queryStart, {
      rowCount: statuses.length,
    });

    const totalDuration = Date.now() - startTime;
    log.info('Work item statuses retrieved successfully', {
      typeId,
      count: statuses.length,
      totalDuration,
    });

    return createSuccessResponse({
      statuses: statuses.map((status) => ({
        work_item_status_id: status.work_item_status_id,
        work_item_type_id: status.work_item_type_id,
        status_name: status.status_name,
        status_category: status.status_category,
        is_initial: status.is_initial,
        is_final: status.is_final,
        color: status.color,
        display_order: status.display_order,
        created_at: status.created_at,
        updated_at: status.updated_at,
      })),
    });
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    log.error('Get work item statuses request failed', error, { totalDuration });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

export const GET = rbacRoute(getStatusesHandler, {
  permission: 'work-items:read:organization',
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

/**
 * POST /api/work-item-types/[id]/statuses
 * Create a new status for a work item type
 */
const createStatusHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const { workItemTypeParamsSchema, workItemStatusCreateSchema } = await import(
      '@/lib/validations/work-items'
    );
    const { id: typeId } = await extractRouteParams(args[0], workItemTypeParamsSchema);

    log.info('Create work item status request initiated', {
      operation: 'create_work_item_status',
      requestingUserId: userContext.user_id,
      typeId,
    });

    const validatedData = await validateRequest(request, workItemStatusCreateSchema);

    const statusesService = createRBACWorkItemStatusesService(userContext);

    const createStart = Date.now();
    const newStatus = await statusesService.createStatus({
      work_item_type_id: typeId,
      status_name: validatedData.status_name,
      status_category: validatedData.status_category,
      ...(validatedData.is_initial !== undefined && { is_initial: validatedData.is_initial }),
      ...(validatedData.is_final !== undefined && { is_final: validatedData.is_final }),
      ...(validatedData.color !== undefined && { color: validatedData.color }),
      ...(validatedData.display_order !== undefined && {
        display_order: validatedData.display_order,
      }),
    });
    log.db('INSERT', 'work_item_statuses', Date.now() - createStart, { rowCount: 1 });

    const totalDuration = Date.now() - startTime;
    log.info('Work item status created successfully', {
      statusId: newStatus.work_item_status_id,
      typeId,
      totalDuration,
    });

    return createSuccessResponse({
      id: newStatus.work_item_status_id,
      work_item_type_id: newStatus.work_item_type_id,
      status_name: newStatus.status_name,
      status_category: newStatus.status_category,
      is_initial: newStatus.is_initial,
      is_final: newStatus.is_final,
      color: newStatus.color,
      display_order: newStatus.display_order,
      created_at: newStatus.created_at,
      updated_at: newStatus.updated_at,
    });
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    log.error('Create work item status request failed', error, { totalDuration });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

export const POST = rbacRoute(createStatusHandler, {
  permission: 'work-items:manage:organization',
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
