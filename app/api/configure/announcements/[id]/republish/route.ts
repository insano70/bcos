import type { NextRequest } from 'next/server';

import { createErrorResponse, handleRouteError, NotFoundError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractRouteParams } from '@/lib/api/utils/params';
import { log } from '@/lib/logger';
import { createRBACAnnouncementsService } from '@/lib/services/rbac-announcements-service';
import type { UserContext } from '@/lib/types/rbac';
import { announcementIdParamsSchema } from '@/lib/validations/announcements';

/**
 * Republish Announcement API
 * Clears read records so users see the announcement again
 * Requires settings:update:all permission
 */

// POST - Republish announcement (clear read records)
const republishAnnouncementHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  let announcementId: string | undefined;

  try {
    const { id } = await extractRouteParams(args[0], announcementIdParamsSchema);
    announcementId = id;

    const service = createRBACAnnouncementsService(userContext);
    const announcement = await service.getById(announcementId);

    if (!announcement) {
      return createErrorResponse(NotFoundError('Announcement'), 404, request);
    }

    await service.republish(announcementId);

    const duration = Date.now() - startTime;

    log.info('announcement republished successfully', {
      operation: 'republish_announcement',
      resourceType: 'announcement',
      resourceId: announcementId,
      userId: userContext.user_id,
      duration,
      metadata: {
        subject: announcement.subject,
        targetType: announcement.target_type,
        previousReadCount: announcement.read_count,
      },
      component: 'admin',
    });

    return createSuccessResponse(
      { republished: true, announcement_id: announcementId },
      'Announcement republished successfully. All users will see it again.'
    );
  } catch (error) {
    log.error('announcement republish failed', error, {
      operation: 'republish_announcement',
      resourceId: announcementId,
      userId: userContext.user_id,
      component: 'admin',
    });

    return handleRouteError(error, 'Failed to republish announcement', request);
  }
};

export const POST = rbacRoute(republishAnnouncementHandler, {
  permission: 'settings:update:all',
  rateLimit: 'api',
});
