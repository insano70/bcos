import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { AttachmentFieldService } from '@/lib/services/work-items/attachment-field-service';
import type { UserContext } from '@/lib/types/rbac';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse, handleRouteError } from '@/lib/api/responses/error';

/**
 * GET /api/work-items/[id]/fields/[fieldId]/attachments/[attachmentId]/thumbnail
 * Get thumbnail download URL for an image attachment
 */
const getThumbnailHandler = async (
  request: NextRequest,
  userContext: UserContext
) => {
  try {
    // Parse URL parameters
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const attachmentId = pathParts[7];

    if (!attachmentId) {
      return createErrorResponse('Invalid attachment ID', 400);
    }

    const service = new AttachmentFieldService(userContext);
    const thumbnailUrl = await service.getThumbnailUrl(attachmentId);

    if (!thumbnailUrl) {
      return createErrorResponse('Thumbnail not available for this attachment', 404);
    }

    return createSuccessResponse({
      thumbnail_url: thumbnailUrl,
    });
  } catch (error) {
    return handleRouteError(error, 'Failed to generate thumbnail URL', request);
  }
};

export const GET = rbacRoute(getThumbnailHandler, {
  permission: 'work-items:read:all',
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';
