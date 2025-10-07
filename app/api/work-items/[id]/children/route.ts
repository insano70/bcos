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
 * GET /api/work-items/[id]/children
 * Get child work items (direct children only)
 */
const getWorkItemChildrenHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const validationStart = Date.now();
    const validatedParams = await extractRouteParams(args[0], workItemParamsSchema);
    log.info('Request validation completed', { duration: Date.now() - validationStart });

    log.info('Get work item children request initiated', {
      requestingUserId: userContext.user_id,
      parentWorkItemId: validatedParams.id,
    });

    // Create RBAC service
    const serviceStart = Date.now();
    const workItemsService = createRBACWorkItemsService(userContext);
    log.info('RBAC service created', { duration: Date.now() - serviceStart });

    // Get children with automatic permission checking
    const childrenStart = Date.now();
    const children = await workItemsService.getWorkItemChildren(validatedParams.id);
    log.db('SELECT', 'work_items_children', Date.now() - childrenStart, { rowCount: children.length });

    const totalDuration = Date.now() - startTime;
    log.info('Work item children retrieved successfully', {
      parentWorkItemId: validatedParams.id,
      childCount: children.length,
      totalDuration,
    });

    return createSuccessResponse(
      children.map((child) => ({
        id: child.work_item_id,
        work_item_type_id: child.work_item_type_id,
        work_item_type_name: child.work_item_type_name,
        organization_id: child.organization_id,
        organization_name: child.organization_name,
        subject: child.subject,
        description: child.description,
        status_id: child.status_id,
        status_name: child.status_name,
        status_category: child.status_category,
        priority: child.priority,
        assigned_to: child.assigned_to,
        assigned_to_name: child.assigned_to_name,
        due_date: child.due_date,
        started_at: child.started_at,
        completed_at: child.completed_at,
        created_by: child.created_by,
        created_by_name: child.created_by_name,
        created_at: child.created_at,
        updated_at: child.updated_at,
      }))
    );
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Get work item children failed', error, {
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

export const GET = rbacRoute(getWorkItemChildrenHandler, {
  permission: ['work-items:read:own', 'work-items:read:organization', 'work-items:read:all'],
  extractResourceId: extractors.workItemId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
