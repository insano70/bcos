import { type NextRequest, NextResponse } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { handleRouteError } from '@/lib/api/responses/error';
import { log } from '@/lib/logger';
import { createRBACWorkItemsService } from '@/lib/services/work-items';
import { createRBACWorkItemWatchersService } from '@/lib/services/rbac-work-item-watchers-service';
import type { UserContext } from '@/lib/types/rbac';

/**
 * GET /api/work-items/watched
 * Get all work items the current user is watching
 * Phase 7: Watchers and notifications
 */
const getWatchedHandler = async (
  _request: NextRequest,
  userContext: UserContext
) => {
  const startTime = Date.now();

  try {
    // Get watched work item IDs for the current user
    const watchersService = createRBACWorkItemWatchersService(userContext);
    const watchedWorkItemIds = await watchersService.getWatchedWorkItemsForUser(
      userContext.user_id
    );

    if (watchedWorkItemIds.length === 0) {
      const duration = Date.now() - startTime;
      log.info('No watched work items found for user', {
        userId: userContext.user_id,
        duration,
      });
      return NextResponse.json([]);
    }

    // Fetch full details for all watched work items
    const workItemsService = createRBACWorkItemsService(userContext);
    const watchedWorkItems = await Promise.all(
      watchedWorkItemIds.map((id) => workItemsService.getWorkItemById(id))
    );

    // Filter out null results (work items that may have been deleted or user lost access)
    const validWorkItems = watchedWorkItems.filter((item) => item !== null);

    const duration = Date.now() - startTime;
    log.info('Watched work items retrieved', {
      userId: userContext.user_id,
      returned: validWorkItems.length,
      total: watchedWorkItemIds.length,
      duration,
      operation: 'list_watched_work_items',
      component: 'work-items',
    });

    return NextResponse.json(validWorkItems);
  } catch (error) {
    log.error('Failed to get watched work items', error, {
      operation: 'list_watched_work_items',
      userId: userContext.user_id,
      component: 'work-items',
    });

    return handleRouteError(error, 'Failed to get watched work items');
  }
};

export const GET = rbacRoute(getWatchedHandler, {
  permission: ['work-items:read:own', 'work-items:read:organization', 'work-items:read:all'],
  rateLimit: 'api',
});

