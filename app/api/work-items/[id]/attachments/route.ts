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
import { log, logTemplates, sanitizeFilters } from '@/lib/logger';

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
    const validatedParams = await extractRouteParams(args[0], workItemParamsSchema);
    const query = validateQuery(searchParams, workItemAttachmentQuerySchema);

    const attachmentsService = createRBACWorkItemAttachmentsService(userContext);
    const attachments = await attachmentsService.getAttachments({
      work_item_id: validatedParams.id,
      limit: query.limit,
      offset: query.offset,
    });

    const duration = Date.now() - startTime;
    const filters = sanitizeFilters({
      work_item_id: validatedParams.id,
      limit: query.limit,
      offset: query.offset,
    });

    const totalSize = attachments.reduce((sum, a) => sum + a.file_size, 0);
    const fileTypeCounts = attachments.reduce((acc, a) => {
      const type = a.file_type || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    log.info(`work item attachments list completed - returned ${attachments.length} attachments`, {
      operation: 'list_work_item_attachments',
      resourceType: 'work_item_attachments',
      userId: userContext.user_id,
      filters,
      results: {
        returned: attachments.length,
        totalSize,
        byFileType: fileTypeCounts,
      },
      duration,
      slow: duration > 1000,
      component: 'work-items',
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
    log.error('work item attachments list failed', error, {
      operation: 'list_work_item_attachments',
      userId: userContext.user_id,
      component: 'work-items',
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
    const validatedParams = await extractRouteParams(args[0], workItemParamsSchema);
    const validatedData = await validateRequest(request, workItemAttachmentCreateSchema);

    const attachmentsService = createRBACWorkItemAttachmentsService(userContext);

    // This generates a presigned upload URL and creates the DB record
    const result = await attachmentsService.createAttachment({
      work_item_id: validatedParams.id,
      file_name: validatedData.file_name,
      file_size: validatedData.file_size,
      file_type: validatedData.file_type,
    });

    const duration = Date.now() - startTime;
    const template = logTemplates.crud.create('work_item_attachment', {
      resourceId: String(result.attachment.work_item_attachment_id),
      userId: userContext.user_id,
      duration,
      metadata: {
        workItemId: result.attachment.work_item_id,
        fileName: result.attachment.file_name,
        fileSize: result.attachment.file_size,
        fileType: result.attachment.file_type,
        s3Bucket: result.attachment.s3_bucket,
        presignedUrlGenerated: !!result.uploadUrl,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse(
      {
        work_item_attachment_id: result.attachment.work_item_attachment_id,
        work_item_id: result.attachment.work_item_id,
        file_name: result.attachment.file_name,
        file_size: result.attachment.file_size,
        file_type: result.attachment.file_type,
        s3_key: result.attachment.s3_key,
        s3_bucket: result.attachment.s3_bucket,
        uploaded_by: result.attachment.uploaded_by,
        uploaded_by_name: result.attachment.uploaded_by_name,
        uploaded_at: result.attachment.uploaded_at,
        upload_url: result.uploadUrl, // Presigned URL for client to upload to S3
      },
      'Attachment created successfully. Use upload_url to upload file to S3.'
    );
  } catch (error) {
    log.error('work item attachment creation failed', error, {
      operation: 'create_work_item_attachment',
      userId: userContext.user_id,
      component: 'work-items',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

export const GET = rbacRoute(getWorkItemAttachmentsHandler, {
  permission: ['work-items:read:own', 'work-items:read:organization', 'work-items:read:all'],
  extractResourceId: extractors.workItemId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

export const POST = rbacRoute(createWorkItemAttachmentHandler, {
  permission: ['work-items:update:own', 'work-items:update:organization', 'work-items:update:all'],
  extractResourceId: extractors.workItemId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
