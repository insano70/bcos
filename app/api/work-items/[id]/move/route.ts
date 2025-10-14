import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { validateRequest } from '@/lib/api/middleware/validation';
import { extractRouteParams } from '@/lib/api/utils/params';
import { workItemMoveSchema, workItemParamsSchema } from '@/lib/validations/work-items';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { createWorkItemHierarchyService } from '@/lib/services/work-item-hierarchy-service';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

/**
 * POST /api/work-items/[id]/move
 * Move a work item to a new parent (reparent operation)
 */
const moveWorkItemHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const validationStart = Date.now();
    const validatedParams = await extractRouteParams(args[0], workItemParamsSchema);
    const validatedData = await validateRequest(request, workItemMoveSchema);
    log.info('Request validation completed', { duration: Date.now() - validationStart });

    log.info('Move work item request initiated', {
      requestingUserId: userContext.user_id,
      workItemId: validatedParams.id,
      newParentId: validatedData.parent_work_item_id,
    });

    // Create hierarchy service
    const serviceStart = Date.now();
    const hierarchyService = createWorkItemHierarchyService(userContext);
    log.info('Hierarchy service created', { duration: Date.now() - serviceStart });

    // Move work item with automatic permission checking and path recalculation
    const moveStart = Date.now();
    const movedWorkItem = await hierarchyService.moveWorkItem(
      validatedParams.id,
      validatedData.parent_work_item_id
    );
    log.db('UPDATE', 'work_items_move', Date.now() - moveStart, { rowCount: 1 });

    const totalDuration = Date.now() - startTime;
    log.info('Work item moved successfully', {
      workItemId: validatedParams.id,
      newParentId: validatedData.parent_work_item_id,
      totalDuration,
    });

    return createSuccessResponse(
      {
        id: movedWorkItem.work_item_id,
        work_item_type_id: movedWorkItem.work_item_type_id,
        work_item_type_name: movedWorkItem.work_item_type_name,
        organization_id: movedWorkItem.organization_id,
        organization_name: movedWorkItem.organization_name,
        subject: movedWorkItem.subject,
        description: movedWorkItem.description,
        status_id: movedWorkItem.status_id,
        status_name: movedWorkItem.status_name,
        status_category: movedWorkItem.status_category,
        priority: movedWorkItem.priority,
        assigned_to: movedWorkItem.assigned_to,
        assigned_to_name: movedWorkItem.assigned_to_name,
        due_date: movedWorkItem.due_date,
        started_at: movedWorkItem.started_at,
        completed_at: movedWorkItem.completed_at,
        created_by: movedWorkItem.created_by,
        created_by_name: movedWorkItem.created_by_name,
        created_at: movedWorkItem.created_at,
        updated_at: movedWorkItem.updated_at,
      },
      'Work item moved successfully'
    );
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Move work item failed', error, {
      requestingUserId: userContext.user_id,
      totalDuration,
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

export const POST = rbacRoute(moveWorkItemHandler, {
  permission: ['work-items:update:own', 'work-items:update:organization', 'work-items:update:all'],
  extractResourceId: extractors.workItemId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
