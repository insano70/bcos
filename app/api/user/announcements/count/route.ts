import type { NextRequest } from 'next/server';

import { handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import { createUserAnnouncementsService } from '@/lib/services/user-announcements-service';
import type { UserContext } from '@/lib/types/rbac';

/**
 * User Announcements Count API
 * Returns count of unread announcements for header badge
 * Lightweight endpoint for polling
 */

// GET - Get unread count for current user
const getUnreadCountHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const service = createUserAnnouncementsService(userContext);
    const count = await service.getUnreadCount();

    const duration = Date.now() - startTime;

    // Only log if slow or if there are unread announcements
    if (duration > SLOW_THRESHOLDS.API_OPERATION || count > 0) {
      log.info('user announcements count query completed', {
        operation: 'get_unread_count',
        resourceType: 'user_announcements',
        userId: userContext.user_id,
        results: { unreadCount: count },
        duration,
        slow: duration > SLOW_THRESHOLDS.API_OPERATION,
        component: 'user',
      });
    }

    return createSuccessResponse(
      { count },
      'Unread count retrieved successfully'
    );
  } catch (error) {
    log.error('user announcements count query failed', error, {
      operation: 'get_unread_count',
      userId: userContext.user_id,
      component: 'user',
    });

    return handleRouteError(error, 'Failed to fetch announcement count', request);
  }
};

export const GET = rbacRoute(getUnreadCountHandler, {
  permission: 'users:read:own',
  rateLimit: 'api',
});
