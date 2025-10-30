import { type NextRequest, NextResponse } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
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

    // Delete attachment
    const service = createAttachmentFieldService(userContext);
    await service.deleteFieldAttachment(params.attachmentId);

    log.info('Field attachment deleted successfully via API', {
      workItemId: params.id,
      fieldId: params.fieldId,
      attachmentId: params.attachmentId,
      duration: Date.now() - startTime,
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    log.error('Field attachment deletion failed via API', error as Error, {
      duration: Date.now() - startTime,
    });

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to delete field attachment' }, { status: 500 });
  }
}

export const DELETE = rbacRoute(handleDelete, {
  permission: ['work-items:update:all', 'work-items:update:organization', 'work-items:update:own'],
  rateLimit: 'api',
});
