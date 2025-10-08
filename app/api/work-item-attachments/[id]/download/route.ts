import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { extractRouteParams } from '@/lib/api/utils/params';
import { workItemAttachmentParamsSchema } from '@/lib/validations/work-item-attachments';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createRBACWorkItemAttachmentsService } from '@/lib/services/rbac-work-item-attachments-service';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

/**
 * GET /api/work-item-attachments/[id]/download
 * Get presigned download URL for an attachment
 */
const getDownloadUrlHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const validatedParams = await extractRouteParams(args[0], workItemAttachmentParamsSchema);

    log.info('Get download URL request initiated', {
      requestingUserId: userContext.user_id,
      attachmentId: validatedParams.id,
    });

    const attachmentsService = createRBACWorkItemAttachmentsService(userContext);
    const downloadUrl = await attachmentsService.getDownloadUrl(validatedParams.id);

    const totalDuration = Date.now() - startTime;
    log.info('Download URL generated successfully', {
      attachmentId: validatedParams.id,
      totalDuration,
    });

    return createSuccessResponse(
      { download_url: downloadUrl },
      'Download URL generated successfully'
    );
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Get download URL failed', error, {
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

export const GET = rbacRoute(getDownloadUrlHandler, {
  permission: ['work-items:read:own', 'work-items:read:organization', 'work-items:read:all'],
  rateLimit: 'api',
});
