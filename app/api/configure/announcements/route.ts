import type { NextRequest } from 'next/server';

import { validateRequest } from '@/lib/api/middleware/validation';
import { handleRouteError } from '@/lib/api/responses/error';
import { createPaginatedResponse, createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log, logTemplates, SLOW_THRESHOLDS } from '@/lib/logger';
import { createRBACAnnouncementsService } from '@/lib/services/rbac-announcements-service';
import type { UserContext } from '@/lib/types/rbac';
import {
  announcementQuerySchema,
  createAnnouncementSchema,
} from '@/lib/validations/announcements';

/**
 * Admin Announcements CRUD API
 * Manages announcements for broadcast to users
 * Requires settings:update:all permission
 */

// GET - List all announcements (paginated, filtered)
const getAnnouncementsHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const queryParams = {
      search: searchParams.get('search') || undefined,
      target_type: searchParams.get('target_type') || undefined,
      is_active: searchParams.get('is_active') || undefined,
      include_expired: searchParams.get('include_expired') || undefined,
    };

    const validatedQuery = announcementQuerySchema.parse(queryParams);

    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const service = createRBACAnnouncementsService(userContext);
    const result = await service.getList({
      ...validatedQuery,
      limit,
      offset,
    });

    const duration = Date.now() - startTime;

    log.info(`announcements list query completed - returned ${result.items.length} announcements`, {
      operation: 'list_announcements',
      resourceType: 'announcements',
      userId: userContext.user_id,
      filters: {
        search: validatedQuery.search,
        target_type: validatedQuery.target_type,
        is_active: validatedQuery.is_active,
        include_expired: validatedQuery.include_expired,
      },
      results: {
        returned: result.items.length,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
      },
      duration,
      slow: duration > SLOW_THRESHOLDS.API_OPERATION,
      component: 'admin',
    });

    return createPaginatedResponse(result.items, {
      page: result.page,
      limit: result.pageSize,
      total: result.total,
    });
  } catch (error) {
    log.error('announcements list query failed', error, {
      operation: 'list_announcements',
      userId: userContext.user_id,
      component: 'admin',
    });

    return handleRouteError(error, 'Failed to fetch announcements', request);
  }
};

// POST - Create new announcement
const createAnnouncementHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const data = await validateRequest(request, createAnnouncementSchema);

    const service = createRBACAnnouncementsService(userContext);
    const announcement = await service.createAnnouncement(data);

    const duration = Date.now() - startTime;
    const template = logTemplates.crud.create('announcement', {
      resourceId: announcement.announcement_id,
      userId: userContext.user_id,
      duration,
      metadata: {
        targetType: data.target_type,
        priority: data.priority,
        recipientCount: data.recipient_user_ids?.length || 0,
        hasPublishAt: !!data.publish_at,
        hasExpiresAt: !!data.expires_at,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse(announcement, 'Announcement created successfully');
  } catch (error) {
    log.error('announcement creation failed', error, {
      operation: 'create_announcement',
      userId: userContext.user_id,
      component: 'admin',
    });

    return handleRouteError(error, 'Failed to create announcement', request);
  }
};

export const GET = rbacRoute(getAnnouncementsHandler, {
  permission: 'settings:update:all',
  rateLimit: 'api',
});

export const POST = rbacRoute(createAnnouncementHandler, {
  permission: 'settings:update:all',
  rateLimit: 'api',
});
