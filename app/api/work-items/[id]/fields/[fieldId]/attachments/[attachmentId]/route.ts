import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { log } from '@/lib/logger';
import { createAttachmentFieldService } from '@/lib/services/work-items/attachment-field-service';
import type { UserContext } from '@/lib/types/rbac';
import { fieldAttachmentDetailParamsSchema } from '@/lib/validations/work-item-attachments';

/**
 * DELETE /api/work-items/[id]/fields/[fieldId]/attachments/[attachmentId]
 * Delete field attachment and update field value
 */
async function handleDelete(request: NextRequest, userContext: UserContext) {
  const startTime = Date.now();

  try {
    // Parse URL parameters
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const workItemId = pathParts[3];
    const fieldId = pathParts[5];
    const attachmentId = pathParts[7];

    // Validate path parameters
    const params = fieldAttachmentDetailParamsSchema.parse({
      id: workItemId,
      fieldId: fieldId,
      attachmentId: attachmentId,
    });

    log.info('Field attachment deletion requested via API', {
      workItemId: params.id,
      fieldId: params.fieldId,
      attachmentId: params.attachmentId,
      userId: userContext.user_id,
    });

    const service = createAttachmentFieldService(userContext);

    // Verify attachment exists and belongs to the work item in the path
    const attachment = await service.getFieldAttachmentById(params.attachmentId);
    if (!attachment) {
      return handleRouteError(new Error('Attachment not found'), 'Attachment not found', request);
    }

    // Security: Validate attachment belongs to the work item specified in URL path
    // This prevents IDOR attacks where an attacker could delete attachments from
    // other work items by manipulating the URL path
    if (attachment.work_item_id !== params.id) {
      log.warn('Attachment path mismatch detected - potential IDOR attempt', {
        pathWorkItemId: params.id,
        actualWorkItemId: attachment.work_item_id,
        attachmentId: params.attachmentId,
        userId: userContext.user_id,
      });
      return handleRouteError(
        new Error('Attachment does not belong to specified work item'),
        'Attachment not found',
        request
      );
    }

    // Also verify the field ID matches
    if (attachment.work_item_field_id !== params.fieldId) {
      log.warn('Attachment field mismatch detected - potential IDOR attempt', {
        pathFieldId: params.fieldId,
        actualFieldId: attachment.work_item_field_id,
        attachmentId: params.attachmentId,
        userId: userContext.user_id,
      });
      return handleRouteError(
        new Error('Attachment does not belong to specified field'),
        'Attachment not found',
        request
      );
    }

    // Delete attachment (permission already verified via getFieldAttachmentById)
    await service.deleteFieldAttachment(params.attachmentId);

    log.info('Field attachment deleted successfully via API', {
      workItemId: params.id,
      fieldId: params.fieldId,
      attachmentId: params.attachmentId,
      duration: Date.now() - startTime,
    });

    return createSuccessResponse({ deleted: true });
  } catch (error) {
    log.error('Field attachment deletion failed via API', error as Error, {
      duration: Date.now() - startTime,
    });

    return handleRouteError(error, 'Failed to delete field attachment', request);
  }
}

export const DELETE = rbacRoute(handleDelete, {
  permission: ['work-items:update:all', 'work-items:update:organization', 'work-items:update:own'],
  rateLimit: 'api',
});
