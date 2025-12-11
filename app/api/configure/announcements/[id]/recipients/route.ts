import type { NextRequest } from 'next/server';

import { createErrorResponse, handleRouteError, NotFoundError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractRouteParams } from '@/lib/api/utils/params';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import { createRBACAnnouncementsService } from '@/lib/services/rbac-announcements-service';
import type { UserContext } from '@/lib/types/rbac';
import { announcementIdParamsSchema } from '@/lib/validations/announcements';

/**
 * Announcement Recipients API
 * Lists users targeted by a specific announcement
 * Requires settings:update:all permission
 */

// GET - Get recipients for an announcement
const getRecipientsHandler = async (
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

    const recipients = await service.getRecipients(announcementId);

    const duration = Date.now() - startTime;

    log.info(`announcement recipients query completed - returned ${recipients.length} recipients`, {
      operation: 'list_announcement_recipients',
      resourceType: 'announcement_recipients',
      resourceId: announcementId,
      userId: userContext.user_id,
      results: {
        returned: recipients.length,
        targetType: announcement.target_type,
      },
      duration,
      slow: duration > SLOW_THRESHOLDS.API_OPERATION,
      component: 'admin',
    });

    return createSuccessResponse(
      {
        recipients,
        announcement_id: announcementId,
        target_type: announcement.target_type,
      },
      'Recipients retrieved successfully'
    );
  } catch (error) {
    log.error('announcement recipients query failed', error, {
      operation: 'list_announcement_recipients',
      resourceId: announcementId,
      userId: userContext.user_id,
      component: 'admin',
    });

    return handleRouteError(error, 'Failed to fetch announcement recipients', request);
  }
};

export const GET = rbacRoute(getRecipientsHandler, {
  permission: 'settings:update:all',
  rateLimit: 'api',
});
