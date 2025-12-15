import type { NextRequest } from 'next/server';
import { validateRequest } from '@/lib/api/middleware/validation';
import { handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractRouteParams } from '@/lib/api/utils/params';
import { log } from '@/lib/logger';
import { createRBACWorkItemStatusTransitionsService } from '@/lib/services/rbac-work-item-status-transitions-service';
import type { UserContext } from '@/lib/types/rbac';
import {
  workItemStatusTransitionCreateSchema,
  workItemTypeParamsSchema,
} from '@/lib/validations/work-items';

/**
 * GET /api/work-item-types/[id]/transitions
 * List all status transitions for a work item type
 */
const getTransitionsHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const requestStart = Date.now();

  try {
    const { id: typeId } = await extractRouteParams(args[0], workItemTypeParamsSchema);

    // Parse query parameters for filtering
    const searchParams = request.nextUrl.searchParams;
    const filters: { from_status_id?: string; to_status_id?: string } = {};

    const fromStatusId = searchParams.get('from_status_id');
    if (fromStatusId) {
      filters.from_status_id = fromStatusId;
    }

    const toStatusId = searchParams.get('to_status_id');
    if (toStatusId) {
      filters.to_status_id = toStatusId;
    }

    const transitionsService = createRBACWorkItemStatusTransitionsService(userContext);
    const result = await transitionsService.getList({
      work_item_type_id: typeId,
      ...(filters.from_status_id && { from_status_id: filters.from_status_id }),
      ...(filters.to_status_id && { to_status_id: filters.to_status_id }),
      limit: 1000,
    });
    const transitions = result.items.map((item) => ({
      ...item,
      validation_config: item.validation_config ?? null,
      action_config: item.action_config ?? null,
    }));

    const duration = Date.now() - requestStart;
    log.info(`GET /api/work-item-types/${typeId}/transitions completed`, {
      typeId,
      filters,
      count: transitions.length,
      duration,
      userId: userContext.user_id,
      operation: 'list_status_transitions',
      component: 'work-items',
    });

    return createSuccessResponse({ transitions });
  } catch (error) {
    const duration = Date.now() - requestStart;
    log.error('GET /api/work-item-types/[id]/transitions failed', error, {
      duration,
      userId: userContext.user_id,
      operation: 'list_status_transitions',
      component: 'work-items',
    });
    return handleRouteError(error, 'Failed to process work item transitions', request);
  }
};

/**
 * POST /api/work-item-types/[id]/transitions
 * Create a new status transition rule
 */
const createTransitionHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const requestStart = Date.now();

  try {
    const { id: typeId } = await extractRouteParams(args[0], workItemTypeParamsSchema);
    const validatedData = await validateRequest(request, workItemStatusTransitionCreateSchema);

    // Ensure the work_item_type_id in the body matches the route parameter
    if (validatedData.work_item_type_id !== typeId) {
      throw new Error('Work item type ID mismatch between route and body');
    }

    const transitionsService = createRBACWorkItemStatusTransitionsService(userContext);
    const newTransition = await transitionsService.create({
      work_item_type_id: typeId,
      from_status_id: validatedData.from_status_id,
      to_status_id: validatedData.to_status_id,
      is_allowed: validatedData.is_allowed,
    });

    const duration = Date.now() - requestStart;
    log.info(`POST /api/work-item-types/${typeId}/transitions completed`, {
      typeId,
      transitionId: newTransition.work_item_status_transition_id,
      fromStatusId: validatedData.from_status_id,
      toStatusId: validatedData.to_status_id,
      duration,
      userId: userContext.user_id,
      operation: 'create_status_transition',
      component: 'work-items',
    });

    return createSuccessResponse(newTransition);
  } catch (error) {
    const duration = Date.now() - requestStart;
    log.error('POST /api/work-item-types/[id]/transitions failed', error, {
      duration,
      userId: userContext.user_id,
      operation: 'create_status_transition',
      component: 'work-items',
    });
    return handleRouteError(error, 'Failed to process work item transitions', request);
  }
};

export const GET = rbacRoute(getTransitionsHandler, {
  permission: 'work-items:manage:organization',
  requireAuth: true,
});

export const POST = rbacRoute(createTransitionHandler, {
  permission: 'work-items:manage:organization',
  requireAuth: true,
});
