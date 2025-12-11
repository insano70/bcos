import type { NextRequest } from 'next/server';

import { handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import { createUserAnnouncementsService } from '@/lib/services/user-announcements-service';
import type { UserContext } from '@/lib/types/rbac';

/**
 * User Announcements API
 * Returns unread announcements for the current user
 * Used by the announcement modal component
 */

// GET - Get unread announcements for current user
const getUnreadAnnouncementsHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const service = createUserAnnouncementsService(userContext);
    const announcements = await service.getUnreadAnnouncements();

    const duration = Date.now() - startTime;

    log.info(`user announcements query completed - returned ${announcements.length} unread`, {
      operation: 'get_unread_announcements',
      resourceType: 'user_announcements',
      userId: userContext.user_id,
      results: {
        unreadCount: announcements.length,
      },
      duration,
      slow: duration > SLOW_THRESHOLDS.API_OPERATION,
      component: 'user',
    });

    return createSuccessResponse(
      {
        announcements,
        count: announcements.length,
      },
      'Unread announcements retrieved successfully'
    );
  } catch (error) {
    log.error('user announcements query failed', error, {
      operation: 'get_unread_announcements',
      userId: userContext.user_id,
      component: 'user',
    });

    return handleRouteError(error, 'Failed to fetch announcements', request);
  }
};

export const GET = rbacRoute(getUnreadAnnouncementsHandler, {
  permission: 'users:read:own',
  rateLimit: 'api',
});
