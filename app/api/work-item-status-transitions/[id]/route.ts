import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse, NotFoundError } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractRouteParams } from '@/lib/api/utils/params';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createRBACWorkItemStatusTransitionsService } from '@/lib/services/rbac-work-item-status-transitions-service';
import {
  workItemStatusTransitionParamsSchema,
  workItemStatusTransitionUpdateSchema,
} from '@/lib/validations/work-items';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

/**
 * GET /api/work-item-status-transitions/[id]
 * Get a single status transition by ID
 */
const getTransitionHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const requestStart = Date.now();

  try {
    const { id } = await extractRouteParams(args[0], workItemStatusTransitionParamsSchema);

    const transitionsService = createRBACWorkItemStatusTransitionsService(userContext);
    const transition = await transitionsService.getTransitionById(id);

    if (!transition) {
      throw NotFoundError('Work item status transition');
    }

    const duration = Date.now() - requestStart;
    log.info(`GET /api/work-item-status-transitions/${id} completed`, {
      transitionId: id,
      duration,
      userId: userContext.user_id,
    });

    return createSuccessResponse({
      work_item_status_transition_id: transition.work_item_status_transition_id,
      work_item_type_id: transition.work_item_type_id,
      from_status_id: transition.from_status_id,
      to_status_id: transition.to_status_id,
      is_allowed: transition.is_allowed,
      created_at: transition.created_at,
      updated_at: transition.updated_at,
    });
  } catch (error) {
    const duration = Date.now() - requestStart;
    log.error('GET /api/work-item-status-transitions/[id] failed', error, {
      duration,
      userId: userContext.user_id,
    });
    return createErrorResponse(error instanceof Error ? error : new Error(String(error)), 500, request);
  }
};

/**
 * PATCH /api/work-item-status-transitions/[id]
 * Update a status transition
 */
const updateTransitionHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const requestStart = Date.now();

  try {
    const { id } = await extractRouteParams(args[0], workItemStatusTransitionParamsSchema);
    const validatedData = await validateRequest(request, workItemStatusTransitionUpdateSchema);

    // Filter out undefined values for exactOptionalPropertyTypes
    const filteredData: { is_allowed?: boolean } = {};
    if (validatedData.is_allowed !== undefined) {
      filteredData.is_allowed = validatedData.is_allowed;
    }

    const transitionsService = createRBACWorkItemStatusTransitionsService(userContext);
    const updatedTransition = await transitionsService.updateTransition(id, filteredData);

    const duration = Date.now() - requestStart;
    log.info(`PATCH /api/work-item-status-transitions/${id} completed`, {
      transitionId: id,
      updates: filteredData,
      duration,
      userId: userContext.user_id,
    });

    return createSuccessResponse(updatedTransition);
  } catch (error) {
    const duration = Date.now() - requestStart;
    log.error('PATCH /api/work-item-status-transitions/[id] failed', error, {
      duration,
      userId: userContext.user_id,
    });
    return createErrorResponse(error instanceof Error ? error : new Error(String(error)), 500, request);
  }
};

/**
 * DELETE /api/work-item-status-transitions/[id]
 * Delete a status transition rule
 */
const deleteTransitionHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const requestStart = Date.now();

  try {
    const { id } = await extractRouteParams(args[0], workItemStatusTransitionParamsSchema);

    const transitionsService = createRBACWorkItemStatusTransitionsService(userContext);
    await transitionsService.deleteTransition(id);

    const duration = Date.now() - requestStart;
    log.info(`DELETE /api/work-item-status-transitions/${id} completed`, {
      transitionId: id,
      duration,
      userId: userContext.user_id,
    });

    return createSuccessResponse({
      message: 'Status transition deleted successfully',
      id,
    });
  } catch (error) {
    const duration = Date.now() - requestStart;
    log.error('DELETE /api/work-item-status-transitions/[id] failed', error, {
      duration,
      userId: userContext.user_id,
    });
    return createErrorResponse(error instanceof Error ? error : new Error(String(error)), 500, request);
  }
};

export const GET = rbacRoute(getTransitionHandler, {
  permission: 'work-items:manage:organization',
  requireAuth: true,
});

export const PATCH = rbacRoute(updateTransitionHandler, {
  permission: 'work-items:manage:organization',
  requireAuth: true,
});

export const DELETE = rbacRoute(deleteTransitionHandler, {
  permission: 'work-items:manage:organization',
  requireAuth: true,
});
