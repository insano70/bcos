import { type NextRequest, NextResponse } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { handleRouteError } from '@/lib/api/responses/error';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { log, sanitizeFilters, SLOW_THRESHOLDS } from '@/lib/logger';
import { createRBACWorkItemWatchersService } from '@/lib/services/rbac-work-item-watchers-service';
import type { UserContext } from '@/lib/types/rbac';

/**
 * GET /api/work-items/[id]/watchers
 * Get all watchers for a work item
 * Phase 7: Watchers and notifications
 */
const getWatchersHandler = async (
  _request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const params = (args[0] as { params: Promise<{ id: string }> }).params;
  const { id: workItemId } = await params;
  const startTime = Date.now();

  try {
    const watchersService = createRBACWorkItemWatchersService(userContext);
    const watchers = await watchersService.getWatchersForWorkItem(workItemId);

    const duration = Date.now() - startTime;
    const filters = sanitizeFilters({ work_item_id: workItemId });

    const watchTypeCounts = watchers.reduce(
      (acc, w) => {
        const type = w.watch_type || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    log.info(`work item watchers list completed - returned ${watchers.length} watchers`, {
      operation: 'list_work_item_watchers',
      resourceType: 'work_item_watchers',
      userId: userContext.user_id,
      filters,
      results: {
        returned: watchers.length,
        byWatchType: watchTypeCounts,
      },
      duration,
      slow: duration > SLOW_THRESHOLDS.API_OPERATION,
      component: 'work-items',
    });

    return NextResponse.json(watchers);
  } catch (error) {
    log.error('work item watchers list failed', error, {
      operation: 'list_work_item_watchers',
      userId: userContext.user_id,
      component: 'work-items',
    });

    return handleRouteError(error, 'Failed to retrieve work item watchers');
  }
};

export const GET = rbacRoute(getWatchersHandler, {
  permission: ['work-items:read:own', 'work-items:read:organization', 'work-items:read:all'],
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
