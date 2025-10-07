import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { validateQuery } from '@/lib/api/middleware/validation';
import { extractRouteParams } from '@/lib/api/utils/params';
import { workItemActivityQuerySchema, workItemParamsSchema } from '@/lib/validations/work-items';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { createRBACWorkItemActivityService } from '@/lib/services/rbac-work-item-activity-service';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

/**
 * GET /api/work-items/[id]/activity
 * Get activity log for a work item
 */
const getWorkItemActivityHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const validationStart = Date.now();
    const validatedParams = await extractRouteParams(args[0], workItemParamsSchema);
    const query = validateQuery(searchParams, workItemActivityQuerySchema);
    log.info('Request validation completed', { duration: Date.now() - validationStart });

    log.info('Get work item activity request initiated', {
      requestingUserId: userContext.user_id,
      workItemId: validatedParams.id,
    });

    // Create RBAC service
    const serviceStart = Date.now();
    const activityService = createRBACWorkItemActivityService(userContext);
    log.info('RBAC service created', { duration: Date.now() - serviceStart });

    // Get activity with automatic permission checking
    const activityStart = Date.now();
    const activity = await activityService.getActivity({
      work_item_id: validatedParams.id,
      activity_type: query.activity_type,
      limit: query.limit,
      offset: query.offset,
    });
    log.db('SELECT', 'work_item_activity', Date.now() - activityStart, { rowCount: activity.length });

    const totalDuration = Date.now() - startTime;
    log.info('Work item activity retrieved successfully', {
      workItemId: validatedParams.id,
      activityCount: activity.length,
      totalDuration,
    });

    return createSuccessResponse(
      activity.map((item) => ({
        work_item_activity_id: item.work_item_activity_id,
        work_item_id: item.work_item_id,
        user_id: item.user_id,
        user_name: item.user_name,
        activity_type: item.activity_type,
        field_name: item.field_name,
        old_value: item.old_value,
        new_value: item.new_value,
        description: item.description,
        created_at: item.created_at,
      }))
    );
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Get work item activity failed', error, {
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

export const GET = rbacRoute(getWorkItemActivityHandler, {
  permission: ['work_items:read:own', 'work_items:read:organization', 'work_items:read:all'],
  extractResourceId: extractors.workItemId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
