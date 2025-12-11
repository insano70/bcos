import type { NextRequest } from 'next/server';

import { validateRequest } from '@/lib/api/middleware/validation';
import { createErrorResponse, handleRouteError, NotFoundError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractRouteParams } from '@/lib/api/utils/params';
import { calculateChanges, log, logTemplates } from '@/lib/logger';
import { createRBACAnnouncementsService } from '@/lib/services/rbac-announcements-service';
import type { UserContext } from '@/lib/types/rbac';
import {
  announcementIdParamsSchema,
  updateAnnouncementSchema,
} from '@/lib/validations/announcements';

/**
 * Admin Announcements Individual CRUD API
 * Manages individual announcement operations
 * Requires settings:update:all permission
 */

// GET - Get single announcement by ID
const getAnnouncementHandler = async (
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
      const template = logTemplates.crud.read('announcement', {
        resourceId: announcementId,
        found: false,
        userId: userContext.user_id,
        duration: Date.now() - startTime,
      });
      log.info(template.message, template.context);
      return createErrorResponse(NotFoundError('Announcement'), 404, request);
    }

    const duration = Date.now() - startTime;
    const template = logTemplates.crud.read('announcement', {
      resourceId: announcement.announcement_id,
      found: true,
      userId: userContext.user_id,
      duration,
      metadata: {
        targetType: announcement.target_type,
        priority: announcement.priority,
        isActive: announcement.is_active,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse(announcement, 'Announcement retrieved successfully');
  } catch (error) {
    log.error('announcement read failed', error, {
      operation: 'read_announcement',
      resourceId: announcementId,
      userId: userContext.user_id,
      component: 'admin',
    });

    return handleRouteError(error, 'Failed to fetch announcement', request);
  }
};

// PATCH - Update announcement by ID
const updateAnnouncementHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();
  let announcementId: string | undefined;

  try {
    const { id } = await extractRouteParams(args[0], announcementIdParamsSchema);
    announcementId = id;

    const updateData = await validateRequest(request, updateAnnouncementSchema);

    const service = createRBACAnnouncementsService(userContext);
    const before = await service.getById(announcementId);

    if (!before) {
      return createErrorResponse(NotFoundError('Announcement'), 404, request);
    }

    const announcement = await service.updateAnnouncement(announcementId, updateData);

    const duration = Date.now() - startTime;
    const changes = calculateChanges(
      {
        subject: before.subject,
        body: before.body,
        target_type: before.target_type,
        priority: before.priority,
        is_active: before.is_active,
        publish_at: before.publish_at,
        expires_at: before.expires_at,
      },
      {
        subject: announcement.subject,
        body: announcement.body,
        target_type: announcement.target_type,
        priority: announcement.priority,
        is_active: announcement.is_active,
        publish_at: announcement.publish_at,
        expires_at: announcement.expires_at,
      }
    );

    const template = logTemplates.crud.update('announcement', {
      resourceId: announcement.announcement_id,
      userId: userContext.user_id,
      changes,
      duration,
      metadata: {
        targetType: announcement.target_type,
        priority: announcement.priority,
        isActive: announcement.is_active,
        recipientsUpdated: updateData.recipient_user_ids !== undefined,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse(announcement, 'Announcement updated successfully');
  } catch (error) {
    log.error('announcement update failed', error, {
      operation: 'update_announcement',
      resourceId: announcementId,
      userId: userContext.user_id,
      component: 'admin',
    });

    return handleRouteError(error, 'Failed to update announcement', request);
  }
};

// DELETE - Soft delete announcement by ID
const deleteAnnouncementHandler = async (
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

    await service.delete(announcementId);

    const duration = Date.now() - startTime;
    const template = logTemplates.crud.delete('announcement', {
      resourceId: announcementId,
      userId: userContext.user_id,
      soft: true,
      duration,
      metadata: {
        subject: announcement.subject,
        targetType: announcement.target_type,
        wasActive: announcement.is_active,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse({ deleted: true }, 'Announcement deleted successfully');
  } catch (error) {
    log.error('announcement deletion failed', error, {
      operation: 'delete_announcement',
      resourceId: announcementId,
      userId: userContext.user_id,
      component: 'admin',
    });

    return handleRouteError(error, 'Failed to delete announcement', request);
  }
};

export const GET = rbacRoute(getAnnouncementHandler, {
  permission: 'settings:update:all',
  rateLimit: 'api',
});

export const PATCH = rbacRoute(updateAnnouncementHandler, {
  permission: 'settings:update:all',
  rateLimit: 'api',
});

export const DELETE = rbacRoute(deleteAnnouncementHandler, {
  permission: 'settings:update:all',
  rateLimit: 'api',
});
