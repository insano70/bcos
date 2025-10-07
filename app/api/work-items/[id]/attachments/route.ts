import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { validateRequest, validateQuery } from '@/lib/api/middleware/validation';
import { extractRouteParams } from '@/lib/api/utils/params';
import {
  workItemAttachmentCreateSchema,
  workItemAttachmentQuerySchema,
  workItemParamsSchema,
} from '@/lib/validations/work-items';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { createRBACWorkItemAttachmentsService } from '@/lib/services/rbac-work-item-attachments-service';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

/**
 * GET /api/work-items/[id]/attachments
 * Get attachments for a work item
 */
const getWorkItemAttachmentsHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const validationStart = Date.now();
    const validatedParams = await extractRouteParams(args[0], workItemParamsSchema);
    const query = validateQuery(searchParams, workItemAttachmentQuerySchema);
    log.info('Request validation completed', { duration: Date.now() - validationStart });

    log.info('Get work item attachments request initiated', {
      requestingUserId: userContext.user_id,
      workItemId: validatedParams.id,
    });

    // Create RBAC service
    const serviceStart = Date.now();
    const attachmentsService = createRBACWorkItemAttachmentsService(userContext);
    log.info('RBAC service created', { duration: Date.now() - serviceStart });

    // Get attachments with automatic permission checking
    const attachmentsStart = Date.now();
    const attachments = await attachmentsService.getAttachments({
      work_item_id: validatedParams.id,
      limit: query.limit,
      offset: query.offset,
    });
    log.db('SELECT', 'work_item_attachments', Date.now() - attachmentsStart, {
      rowCount: attachments.length,
    });

    const totalDuration = Date.now() - startTime;
    log.info('Work item attachments retrieved successfully', {
      workItemId: validatedParams.id,
      attachmentCount: attachments.length,
      totalDuration,
    });

    return createSuccessResponse(
      attachments.map((attachment) => ({
        work_item_attachment_id: attachment.work_item_attachment_id,
        work_item_id: attachment.work_item_id,
        file_name: attachment.file_name,
        file_size: attachment.file_size,
        file_type: attachment.file_type,
        s3_key: attachment.s3_key,
        s3_bucket: attachment.s3_bucket,
        uploaded_by: attachment.uploaded_by,
        uploaded_by_name: attachment.uploaded_by_name,
        uploaded_at: attachment.uploaded_at,
      }))
    );
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Get work item attachments failed', error, {
      requestingUserId: userContext.user_id,
      totalDuration,
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

/**
 * POST /api/work-items/[id]/attachments
 * Create a new attachment on a work item
 */
const createWorkItemAttachmentHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const validationStart = Date.now();
    const validatedParams = await extractRouteParams(args[0], workItemParamsSchema);
    const validatedData = await validateRequest(request, workItemAttachmentCreateSchema);
    log.info('Request validation completed', { duration: Date.now() - validationStart });

    log.info('Create work item attachment request initiated', {
      requestingUserId: userContext.user_id,
      workItemId: validatedParams.id,
      fileName: validatedData.file_name,
    });

    // Create RBAC service
    const serviceStart = Date.now();
    const attachmentsService = createRBACWorkItemAttachmentsService(userContext);
    log.info('RBAC service created', { duration: Date.now() - serviceStart });

    // Create attachment with automatic permission checking
    const attachmentCreationStart = Date.now();
    const newAttachment = await attachmentsService.createAttachment({
      work_item_id: validatedParams.id,
      file_name: validatedData.file_name,
      file_size: validatedData.file_size,
      file_type: validatedData.file_type,
      s3_key: validatedData.s3_key,
      s3_bucket: validatedData.s3_bucket,
    });
    log.db('INSERT', 'work_item_attachments', Date.now() - attachmentCreationStart, { rowCount: 1 });

    const totalDuration = Date.now() - startTime;
    log.info('Work item attachment created successfully', {
      attachmentId: newAttachment.work_item_attachment_id,
      workItemId: validatedParams.id,
      totalDuration,
    });

    return createSuccessResponse(
      {
        work_item_attachment_id: newAttachment.work_item_attachment_id,
        work_item_id: newAttachment.work_item_id,
        file_name: newAttachment.file_name,
        file_size: newAttachment.file_size,
        file_type: newAttachment.file_type,
        s3_key: newAttachment.s3_key,
        s3_bucket: newAttachment.s3_bucket,
        uploaded_by: newAttachment.uploaded_by,
        uploaded_by_name: newAttachment.uploaded_by_name,
        uploaded_at: newAttachment.uploaded_at,
      },
      'Attachment created successfully'
    );
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Create work item attachment failed', error, {
      requestingUserId: userContext.user_id,
      totalDuration,
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

export const GET = rbacRoute(getWorkItemAttachmentsHandler, {
  permission: ['work_items:read:own', 'work_items:read:organization', 'work_items:read:all'],
  extractResourceId: extractors.workItemId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

export const POST = rbacRoute(createWorkItemAttachmentHandler, {
  permission: ['work_items:update:own', 'work_items:update:organization', 'work_items:update:all'],
  extractResourceId: extractors.workItemId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
