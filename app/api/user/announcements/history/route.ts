import type { NextRequest } from 'next/server';

import { handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import { createUserAnnouncementsService } from '@/lib/services/user-announcements-service';
import type { UserContext } from '@/lib/types/rbac';

/**
 * User Announcement History API
 * Returns previously read announcements for the current user
 * Used by the announcement modal history tab
 */

// GET - Get read announcements history for current user
const getReadAnnouncementsHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const service = createUserAnnouncementsService(userContext);
    const announcements = await service.getReadAnnouncements();

    const duration = Date.now() - startTime;

    log.info(`user announcement history query completed - returned ${announcements.length} read`, {
      operation: 'get_read_announcements',
      resourceType: 'user_announcements',
      userId: userContext.user_id,
      results: {
        historyCount: announcements.length,
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
      'Announcement history retrieved successfully'
    );
  } catch (error) {
    log.error('user announcement history query failed', error, {
      operation: 'get_read_announcements',
      userId: userContext.user_id,
      component: 'user',
    });

    return handleRouteError(error, 'Failed to fetch announcement history', request);
  }
};

export const GET = rbacRoute(getReadAnnouncementsHandler, {
  permission: 'users:read:own',
  rateLimit: 'api',
});
