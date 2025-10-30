import { type NextRequest, NextResponse } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log } from '@/lib/logger';
import { createAttachmentFieldService } from '@/lib/services/work-items/attachment-field-service';
import type { UserContext } from '@/lib/types/rbac';
import { fieldAttachmentDetailParamsSchema } from '@/lib/validations/work-item-attachments';

/**
 * GET /api/work-items/[id]/fields/[fieldId]/attachments/[attachmentId]/download
 * Generate presigned download URL for field attachment
 */
async function handleGet(request: NextRequest, userContext: UserContext) {
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

    log.info('Field attachment download URL requested via API', {
      workItemId: params.id,
      fieldId: params.fieldId,
      attachmentId: params.attachmentId,
      userId: userContext.user_id,
    });

    // Generate download URL
    const service = createAttachmentFieldService(userContext);
    const downloadUrl = await service.getDownloadUrl(params.attachmentId);

    log.info('Field attachment download URL generated via API', {
      workItemId: params.id,
      fieldId: params.fieldId,
      attachmentId: params.attachmentId,
      duration: Date.now() - startTime,
    });

    return NextResponse.json({ downloadUrl }, { status: 200 });
  } catch (error) {
    log.error('Field attachment download URL generation failed via API', error as Error, {
      duration: Date.now() - startTime,
    });

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to generate download URL' },
      { status: 500 }
    );
  }
}

export const GET = rbacRoute(handleGet, {
  permission: ['work-items:read:all', 'work-items:read:organization', 'work-items:read:own'],
  rateLimit: 'api',
});
