import { type NextRequest, NextResponse } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { handleRouteError } from '@/lib/api/responses/error';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { log, logTemplates } from '@/lib/logger';
import { createRBACWorkItemWatchersService } from '@/lib/services/rbac-work-item-watchers-service';
import type { UserContext } from '@/lib/types/rbac';

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

  try {
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
    const template = logTemplates.crud.create('work_item_watcher', {
      resourceId: String(watcher.work_item_watcher_id),
      userId: userContext.user_id,
      duration,
      metadata: {
        workItemId,
        watchType: 'manual',
        notifyStatusChanges: true,
        notifyComments: true,
        notifyAssignments: true,
        notifyDueDate: true,
      },
    });

    log.info(template.message, template.context);

    return NextResponse.json(watcher, { status: 201 });
  } catch (error) {
    log.error('work item watcher creation failed', error, {
      operation: 'create_work_item_watcher',
      userId: userContext.user_id,
      component: 'work-items',
    });

    return handleRouteError(error, 'Failed to watch work item');
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

  try {
    const watchersService = createRBACWorkItemWatchersService(userContext);
    await watchersService.removeWatcher(workItemId, userContext.user_id);

    const duration = Date.now() - startTime;
    const template = logTemplates.crud.delete('work_item_watcher', {
      resourceId: workItemId,
      userId: userContext.user_id,
      soft: false,
      duration,
      metadata: {
        workItemId,
        watcherUserId: userContext.user_id,
      },
    });

    log.info(template.message, template.context);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    log.error('work item watcher deletion failed', error, {
      operation: 'delete_work_item_watcher',
      userId: userContext.user_id,
      component: 'work-items',
    });

    return handleRouteError(error, 'Failed to unwatch work item');
  }
};

export const DELETE = rbacRoute(deleteWatchHandler, {
  permission: ['work-items:read:own', 'work-items:read:organization', 'work-items:read:all'],
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
