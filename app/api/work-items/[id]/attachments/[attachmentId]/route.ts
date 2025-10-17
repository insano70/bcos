import type { NextRequest } from 'next/server';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractRouteParams } from '@/lib/api/utils/params';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { log } from '@/lib/logger';
import { createRBACWorkItemAttachmentsService } from '@/lib/services/rbac-work-item-attachments-service';
import type { UserContext } from '@/lib/types/rbac';
import { workItemAttachmentParamsSchema } from '@/lib/validations/work-items';

/**
 * DELETE /api/work-items/[id]/attachments/[attachmentId]
 * Delete an attachment (soft delete)
 */
const deleteWorkItemAttachmentHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const validationStart = Date.now();
    const validatedParams = await extractRouteParams(args[0], workItemAttachmentParamsSchema);
    log.info('Request validation completed', { duration: Date.now() - validationStart });

    log.info('Delete work item attachment request initiated', {
      requestingUserId: userContext.user_id,
      attachmentId: validatedParams.attachmentId,
    });

    // Create RBAC service
    const serviceStart = Date.now();
    const attachmentsService = createRBACWorkItemAttachmentsService(userContext);
    log.info('RBAC service created', { duration: Date.now() - serviceStart });

    // Delete attachment with automatic permission checking
    const deleteStart = Date.now();
    await attachmentsService.deleteAttachment(validatedParams.attachmentId);
    log.db('UPDATE', 'work_item_attachments', Date.now() - deleteStart, { rowCount: 1 });

    const totalDuration = Date.now() - startTime;
    log.info('Work item attachment deleted successfully', {
      attachmentId: validatedParams.attachmentId,
      totalDuration,
    });

    return createSuccessResponse(null, 'Attachment deleted successfully');
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Delete work item attachment failed', error, {
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

export const DELETE = rbacRoute(deleteWorkItemAttachmentHandler, {
  permission: ['work-items:update:own', 'work-items:update:organization', 'work-items:update:all'],
  extractResourceId: extractors.workItemId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
