import { type NextRequest, NextResponse } from 'next/server';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { createRBACWorkItemWatchersService } from '@/lib/services/rbac-work-item-watchers-service';
import { watcherUpdateSchema } from '@/lib/validations/work-item-watchers';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

/**
 * PATCH /api/work-items/[id]/watchers/[watcherId]
 * Update watcher notification preferences
 * Phase 7: Watchers and notifications
 */
const patchWatcherHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const params = (args[0] as { params: Promise<{ id: string; watcherId: string }> }).params;
  const { id: workItemId, watcherId } = await params;
  const startTime = Date.now();

  log.info('Watcher preferences update request initiated', {
    workItemId,
    watcherId,
    userId: userContext.user_id,
  });

  try {
    // Parse request body
    const body = await request.json();

    // Validate request
    const validatedData = watcherUpdateSchema.parse(body);

    // Update preferences
    const watchersService = createRBACWorkItemWatchersService(userContext);
    const watcher = await watchersService.updateWatcherPreferences(
      watcherId,
      validatedData as never
    );

    const duration = Date.now() - startTime;

    log.info('Watcher preferences updated successfully', {
      watcherId,
      workItemId,
      duration,
    });

    return NextResponse.json(watcher);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Failed to update watcher preferences', error, {
      workItemId,
      watcherId,
      userId: userContext.user_id,
      duration,
    });

    if (error instanceof Error) {
      if (error.name === 'ZodError') {
        return NextResponse.json(
          { error: 'Validation failed', details: error.message },
          { status: 400 }
        );
      }

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
      { error: 'Failed to update watcher preferences' },
      { status: 500 }
    );
  }
};

export const PATCH = rbacRoute(patchWatcherHandler, {
  permission: ['work-items:read:own', 'work-items:read:organization', 'work-items:read:all'],
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
