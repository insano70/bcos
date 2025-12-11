import type { NextRequest } from 'next/server';

import { handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log } from '@/lib/logger';
import { createUserAnnouncementsService } from '@/lib/services/user-announcements-service';
import type { UserContext } from '@/lib/types/rbac';

/**
 * Mark All Announcements as Read API
 * Marks all unread announcements as read for the current user
 */

// POST - Mark all announcements as read
const markAllAsReadHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const service = createUserAnnouncementsService(userContext);
    const count = await service.markAllAsRead();

    const duration = Date.now() - startTime;

    log.info('all announcements marked as read', {
      operation: 'mark_all_announcements_read',
      resourceType: 'announcement_read',
      userId: userContext.user_id,
      results: { markedCount: count },
      duration,
      component: 'user',
    });

    return createSuccessResponse(
      { marked_count: count },
      `${count} announcement${count === 1 ? '' : 's'} marked as read`
    );
  } catch (error) {
    log.error('mark all announcements read failed', error, {
      operation: 'mark_all_announcements_read',
      userId: userContext.user_id,
      component: 'user',
    });

    return handleRouteError(error, 'Failed to mark announcements as read', request);
  }
};

export const POST = rbacRoute(markAllAsReadHandler, {
  permission: 'users:read:own',
  rateLimit: 'api',
});
