import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { extractRouteParams } from '@/lib/api/utils/params';
import { workItemParamsSchema } from '@/lib/validations/work-items';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { createRBACWorkItemsService } from '@/lib/services/rbac-work-items-service';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

/**
 * GET /api/work-items/[id]/ancestors
 * Get ancestor work items (breadcrumb trail from root to this item)
 */
const getWorkItemAncestorsHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const validationStart = Date.now();
    const validatedParams = await extractRouteParams(args[0], workItemParamsSchema);
    log.info('Request validation completed', { duration: Date.now() - validationStart });

    log.info('Get work item ancestors request initiated', {
      requestingUserId: userContext.user_id,
      workItemId: validatedParams.id,
    });

    // Create RBAC service
    const serviceStart = Date.now();
    const workItemsService = createRBACWorkItemsService(userContext);
    log.info('RBAC service created', { duration: Date.now() - serviceStart });

    // Get ancestors with automatic permission checking
    const ancestorsStart = Date.now();
    const ancestors = await workItemsService.getWorkItemAncestors(validatedParams.id);
    log.db('SELECT', 'work_items_ancestors', Date.now() - ancestorsStart, { rowCount: ancestors.length });

    const totalDuration = Date.now() - startTime;
    log.info('Work item ancestors retrieved successfully', {
      workItemId: validatedParams.id,
      ancestorCount: ancestors.length,
      totalDuration,
    });

    return createSuccessResponse(
      ancestors.map((ancestor) => ({
        id: ancestor.work_item_id,
        work_item_type_id: ancestor.work_item_type_id,
        work_item_type_name: ancestor.work_item_type_name,
        organization_id: ancestor.organization_id,
        organization_name: ancestor.organization_name,
        subject: ancestor.subject,
        description: ancestor.description,
        status_id: ancestor.status_id,
        status_name: ancestor.status_name,
        status_category: ancestor.status_category,
        priority: ancestor.priority,
        assigned_to: ancestor.assigned_to,
        assigned_to_name: ancestor.assigned_to_name,
        due_date: ancestor.due_date,
        started_at: ancestor.started_at,
        completed_at: ancestor.completed_at,
        created_by: ancestor.created_by,
        created_by_name: ancestor.created_by_name,
        created_at: ancestor.created_at,
        updated_at: ancestor.updated_at,
      }))
    );
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Get work item ancestors failed', error, {
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

export const GET = rbacRoute(getWorkItemAncestorsHandler, {
  permission: ['work-items:read:own', 'work-items:read:organization', 'work-items:read:all'],
  extractResourceId: extractors.workItemId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
