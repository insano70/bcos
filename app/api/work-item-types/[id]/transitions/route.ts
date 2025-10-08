import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractRouteParams } from '@/lib/api/utils/params';
import { validateRequest } from '@/lib/api/middleware/validation';
import { createRBACWorkItemStatusTransitionsService } from '@/lib/services/rbac-work-item-status-transitions-service';
import {
  workItemTypeParamsSchema,
  workItemStatusTransitionCreateSchema,
} from '@/lib/validations/work-items';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

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
    const transitions = await transitionsService.getTransitionsByType(typeId, filters);

    const duration = Date.now() - requestStart;
    log.info(`GET /api/work-item-types/${typeId}/transitions completed`, {
      typeId,
      filters,
      count: transitions.length,
      duration,
      userId: userContext.user_id,
    });

    return createSuccessResponse({ transitions });
  } catch (error) {
    const duration = Date.now() - requestStart;
    log.error('GET /api/work-item-types/[id]/transitions failed', error, {
      duration,
      userId: userContext.user_id,
    });
    return createErrorResponse(error instanceof Error ? error : new Error(String(error)), 500, request);
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
    const newTransition = await transitionsService.createTransition({
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
    });

    return createSuccessResponse(newTransition);
  } catch (error) {
    const duration = Date.now() - requestStart;
    log.error('POST /api/work-item-types/[id]/transitions failed', error, {
      duration,
      userId: userContext.user_id,
    });
    return createErrorResponse(error instanceof Error ? error : new Error(String(error)), 500, request);
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
