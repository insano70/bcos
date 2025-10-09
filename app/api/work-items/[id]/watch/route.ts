import { type NextRequest, NextResponse } from 'next/server';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { createRBACWorkItemWatchersService } from '@/lib/services/rbac-work-item-watchers-service';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

/**
 * POST /api/work-items/[id]/watch
 * Add current user as watcher of a work item
 * Phase 7: Watchers and notifications
 */
const postWatchHandler = async (
  _request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const params = (args[0] as { params: Promise<{ id: string }> }).params;
  const { id: workItemId } = await params;
  const startTime = Date.now();

  log.info('Watch work item request initiated', {
    workItemId,
    userId: userContext.user_id,
  });

  try {
    // Add current user as watcher with watch_type='manual'
    const watchersService = createRBACWorkItemWatchersService(userContext);
    const watcher = await watchersService.addWatcher({
      work_item_id: workItemId,
      user_id: userContext.user_id,
      watch_type: 'manual',
      notify_status_changes: true,
      notify_comments: true,
      notify_assignments: true,
      notify_due_date: true,
    } as never);

    const duration = Date.now() - startTime;

    log.info('User added as watcher successfully', {
      watcherId: watcher.work_item_watcher_id,
      workItemId,
      userId: userContext.user_id,
      duration,
    });

    return NextResponse.json(watcher, { status: 201 });
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to add user as watcher', error, {
      workItemId,
      userId: userContext.user_id,
      duration,
    });

    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }

      if (error.message.includes('already exists') || error.message.includes('already watching')) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }

      if (
        error.message.includes('Permission denied') ||
        error.message.includes('permission')
      ) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }

    return NextResponse.json({ error: 'Failed to watch work item' }, { status: 500 });
  }
};

export const POST = rbacRoute(postWatchHandler, {
  permission: ['work-items:read:own', 'work-items:read:organization', 'work-items:read:all'],
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

/**
 * DELETE /api/work-items/[id]/watch
 * Remove current user as watcher of a work item
 * Phase 7: Watchers and notifications
 */
const deleteWatchHandler = async (
  _request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const params = (args[0] as { params: Promise<{ id: string }> }).params;
  const { id: workItemId } = await params;
  const startTime = Date.now();

  log.info('Unwatch work item request initiated', {
    workItemId,
    userId: userContext.user_id,
  });

  try {
    // Remove current user as watcher
    const watchersService = createRBACWorkItemWatchersService(userContext);
    await watchersService.removeWatcher(workItemId, userContext.user_id);

    const duration = Date.now() - startTime;

    log.info('User removed as watcher successfully', {
      workItemId,
      userId: userContext.user_id,
      duration,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to remove user as watcher', error, {
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

    return NextResponse.json({ error: 'Failed to unwatch work item' }, { status: 500 });
  }
};

export const DELETE = rbacRoute(deleteWatchHandler, {
  permission: ['work-items:read:own', 'work-items:read:organization', 'work-items:read:all'],
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
