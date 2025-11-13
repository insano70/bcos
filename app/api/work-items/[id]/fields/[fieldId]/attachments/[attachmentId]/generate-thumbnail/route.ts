import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { AttachmentFieldService } from '@/lib/services/work-items/attachment-field-service';
import { generateThumbnailForExistingFile } from '@/lib/s3/private-assets';
import type { UserContext } from '@/lib/types/rbac';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';

/**
 * POST /api/work-items/[id]/fields/[fieldId]/attachments/[attachmentId]/generate-thumbnail
 * Generate thumbnail for an existing image attachment
 */
const generateThumbnailHandler = async (
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

    // Get attachment details and verify permissions
    const attachment = await service.getFieldAttachmentById(attachmentId);
    if (!attachment) {
      return createErrorResponse('Attachment not found', 404);
    }

    // Generate thumbnail
    const thumbnailKey = await generateThumbnailForExistingFile(
      attachment.s3_key,
      attachment.file_type
    );

    // Get thumbnail download URL
    const thumbnailUrl = await service.getThumbnailUrl(attachmentId);

    return createSuccessResponse({
      thumbnail_key: thumbnailKey,
      thumbnail_url: thumbnailUrl,
      message: 'Thumbnail generated successfully',
    });
  } catch (error) {
    if (error instanceof Error) {
      return createErrorResponse(error.message, 400);
    }
    return createErrorResponse('Failed to generate thumbnail', 500);
  }
};

export const POST = rbacRoute(generateThumbnailHandler, {
  permission: 'work-items:update:all',
  rateLimit: 'api',
});

export const dynamic = 'force-dynamic';
