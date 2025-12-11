import type { NextRequest } from 'next/server';

import { handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractRouteParams } from '@/lib/api/utils/params';
import { log } from '@/lib/logger';
import { createUserAnnouncementsService } from '@/lib/services/user-announcements-service';
import type { UserContext } from '@/lib/types/rbac';
import { announcementIdParamsSchema } from '@/lib/validations/announcements';

/**
 * Mark Announcement as Read API
 * Marks a single announcement as read for the current user
 */

// POST - Mark announcement as read
const markAsReadHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  let announcementId: string | undefined;

  try {
    const { id } = await extractRouteParams(args[0], announcementIdParamsSchema);
    announcementId = id;

    const service = createUserAnnouncementsService(userContext);
    await service.markAsRead(announcementId);

    const duration = Date.now() - startTime;

    log.info('announcement marked as read', {
      operation: 'mark_announcement_read',
      resourceType: 'announcement_read',
      resourceId: announcementId,
      userId: userContext.user_id,
      duration,
      component: 'user',
    });

    return createSuccessResponse(
      { marked_read: true, announcement_id: announcementId },
      'Announcement marked as read'
    );
  } catch (error) {
    log.error('mark announcement read failed', error, {
      operation: 'mark_announcement_read',
      resourceId: announcementId,
      userId: userContext.user_id,
      component: 'user',
    });

    return handleRouteError(error, 'Failed to mark announcement as read', request);
  }
};

export const POST = rbacRoute(markAsReadHandler, {
  permission: 'users:read:own',
  rateLimit: 'api',
});
