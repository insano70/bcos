import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { log } from '@/lib/logger';
import { createAttachmentFieldService } from '@/lib/services/work-items/attachment-field-service';
import type { UserContext } from '@/lib/types/rbac';
import {
  fieldAttachmentParamsSchema,
  fieldAttachmentUploadSchema,
} from '@/lib/validations/work-item-attachments';

/**
 * POST /api/work-items/[id]/fields/[fieldId]/attachments
 * Create field attachment and generate presigned upload URL
 */
async function handlePost(request: NextRequest, userContext: UserContext) {
  const startTime = Date.now();

  try {
    // Parse URL parameters
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const workItemId = pathParts[3];
    const fieldId = pathParts[5];

    // Validate path parameters
    const params = fieldAttachmentParamsSchema.parse({
      id: workItemId,
      fieldId: fieldId,
    });

    // Parse and validate request body
    const body = await request.json();
    const validatedData = fieldAttachmentUploadSchema.parse({
      ...body,
      work_item_id: params.id,
      work_item_field_id: params.fieldId,
    });

    log.info('Field attachment creation initiated via API', {
      workItemId: params.id,
      fieldId: params.fieldId,
      fileName: validatedData.file_name,
      fileSize: validatedData.file_size,
      fileType: validatedData.file_type,
      userId: userContext.user_id,
    });

    // Create attachment and generate upload URL
    const service = createAttachmentFieldService(userContext);
    const result = await service.createFieldAttachment(validatedData);

    log.info('Field attachment created successfully via API', {
      attachmentId: result.attachment.work_item_attachment_id,
      workItemId: params.id,
      fieldId: params.fieldId,
      duration: Date.now() - startTime,
    });

    return createSuccessResponse(result, undefined, undefined, 201);
  } catch (error) {
    log.error('Field attachment creation failed via API', error as Error, {
      duration: Date.now() - startTime,
    });

    return handleRouteError(error, 'Failed to create field attachment', request);
  }
}

/**
 * GET /api/work-items/[id]/fields/[fieldId]/attachments
 * List attachments for a specific custom field
 */
async function handleGet(request: NextRequest, userContext: UserContext) {
  const startTime = Date.now();

  try {
    // Parse URL parameters
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const workItemId = pathParts[3];
    const fieldId = pathParts[5];

    // Validate path parameters
    const params = fieldAttachmentParamsSchema.parse({
      id: workItemId,
      fieldId: fieldId,
    });

    log.info('Field attachments list requested via API', {
      workItemId: params.id,
      fieldId: params.fieldId,
      userId: userContext.user_id,
    });

    // Get attachments
    const service = createAttachmentFieldService(userContext);
    const attachments = await service.getFieldAttachments(params.id, params.fieldId);

    log.info('Field attachments list retrieved via API', {
      workItemId: params.id,
      fieldId: params.fieldId,
      count: attachments.length,
      duration: Date.now() - startTime,
    });

    return createSuccessResponse({ attachments });
  } catch (error) {
    log.error('Field attachments list retrieval failed via API', error as Error, {
      duration: Date.now() - startTime,
    });

    return handleRouteError(error, 'Failed to retrieve field attachments', request);
  }
}

export const POST = rbacRoute(handlePost, {
  permission: ['work-items:update:all', 'work-items:update:organization', 'work-items:update:own'],
  rateLimit: 'upload',
});

export const GET = rbacRoute(handleGet, {
  permission: ['work-items:read:all', 'work-items:read:organization', 'work-items:read:own'],
  rateLimit: 'api',
});
