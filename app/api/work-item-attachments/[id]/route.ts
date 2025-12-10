import type { NextRequest } from 'next/server';
import { createErrorResponse, handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractRouteParams } from '@/lib/api/utils/params';
import { log } from '@/lib/logger';
import { createRBACWorkItemAttachmentsService } from '@/lib/services/rbac-work-item-attachments-service';
import type { UserContext } from '@/lib/types/rbac';
import { workItemAttachmentParamsSchema } from '@/lib/validations/work-item-attachments';

/**
 * GET /api/work-item-attachments/[id]
 * Get a single attachment by ID
 */
const getAttachmentHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const validatedParams = await extractRouteParams(args[0], workItemAttachmentParamsSchema);

    log.info('Get attachment request initiated', {
      requestingUserId: userContext.user_id,
      attachmentId: validatedParams.id,
    });

    const attachmentsService = createRBACWorkItemAttachmentsService(userContext);
    const attachment = await attachmentsService.getAttachmentById(validatedParams.id);

    if (!attachment) {
      return createErrorResponse('Attachment not found', 404, request);
    }

    const totalDuration = Date.now() - startTime;
    log.info('Attachment retrieved successfully', {
      attachmentId: validatedParams.id,
      totalDuration,
    });

    return createSuccessResponse(attachment);
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Get attachment failed', error, {
      requestingUserId: userContext.user_id,
      totalDuration,
    });

    return handleRouteError(error, 'Failed to process attachment', request);
  }
};

/**
 * DELETE /api/work-item-attachments/[id]
 * Delete an attachment
 */
const deleteAttachmentHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const validatedParams = await extractRouteParams(args[0], workItemAttachmentParamsSchema);

    log.info('Delete attachment request initiated', {
      requestingUserId: userContext.user_id,
      attachmentId: validatedParams.id,
    });

    const attachmentsService = createRBACWorkItemAttachmentsService(userContext);
    await attachmentsService.deleteAttachment(validatedParams.id);

    const totalDuration = Date.now() - startTime;
    log.info('Attachment deleted successfully', {
      attachmentId: validatedParams.id,
      totalDuration,
    });

    return createSuccessResponse({ success: true }, 'Attachment deleted successfully');
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Delete attachment failed', error, {
      requestingUserId: userContext.user_id,
      totalDuration,
    });

    return handleRouteError(error, 'Failed to process attachment', request);
  }
};

export const GET = rbacRoute(getAttachmentHandler, {
  permission: ['work-items:read:own', 'work-items:read:organization', 'work-items:read:all'],
  rateLimit: 'api',
});

export const DELETE = rbacRoute(deleteAttachmentHandler, {
  permission: ['work-items:update:own', 'work-items:update:organization', 'work-items:update:all'],
  rateLimit: 'api',
});
