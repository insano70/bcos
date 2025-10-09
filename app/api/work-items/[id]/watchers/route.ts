import { type NextRequest, NextResponse } from 'next/server';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { createRBACWorkItemWatchersService } from '@/lib/services/rbac-work-item-watchers-service';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

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

  log.info('Work item watchers list request initiated', {
    workItemId,
    userId: userContext.user_id,
  });

  try {
    // Get watchers
    const watchersService = createRBACWorkItemWatchersService(userContext);
    const watchers = await watchersService.getWatchersForWorkItem(workItemId);

    const duration = Date.now() - startTime;

    log.info('Work item watchers retrieved successfully', {
      workItemId,
      count: watchers.length,
      duration,
    });

    return NextResponse.json(watchers);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to retrieve work item watchers', error, {
      workItemId,
      userId: userContext.user_id,
      duration,
    });

    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }

      if (
        error.message.includes('Permission denied') ||
        error.message.includes('permission')
      ) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }

    return NextResponse.json(
      { error: 'Failed to retrieve work item watchers' },
      { status: 500 }
    );
  }
};

export const GET = rbacRoute(getWatchersHandler, {
  permission: ['work-items:read:own', 'work-items:read:organization', 'work-items:read:all'],
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
