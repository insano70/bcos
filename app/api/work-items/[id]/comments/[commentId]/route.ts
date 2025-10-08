import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { validateRequest } from '@/lib/api/middleware/validation';
import { extractRouteParams } from '@/lib/api/utils/params';
import { workItemCommentUpdateSchema, workItemCommentParamsSchema } from '@/lib/validations/work-items';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { createRBACWorkItemCommentsService } from '@/lib/services/rbac-work-item-comments-service';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

/**
 * PUT /api/work-items/[id]/comments/[commentId]
 * Update a comment
 */
const updateWorkItemCommentHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const validationStart = Date.now();
    const validatedParams = await extractRouteParams(args[0], workItemCommentParamsSchema);
    const validatedData = await validateRequest(request, workItemCommentUpdateSchema);
    log.info('Request validation completed', { duration: Date.now() - validationStart });

    log.info('Update work item comment request initiated', {
      requestingUserId: userContext.user_id,
      commentId: validatedParams.commentId,
    });

    // Create RBAC service
    const serviceStart = Date.now();
    const commentsService = createRBACWorkItemCommentsService(userContext);
    log.info('RBAC service created', { duration: Date.now() - serviceStart });

    // Update comment with automatic permission checking
    const updateStart = Date.now();
    const updatedComment = await commentsService.updateComment(validatedParams.commentId, {
      comment_text: validatedData.comment_text,
    });
    log.db('UPDATE', 'work_item_comments', Date.now() - updateStart, { rowCount: 1 });

    const totalDuration = Date.now() - startTime;
    log.info('Work item comment updated successfully', {
      commentId: validatedParams.commentId,
      totalDuration,
    });

    return createSuccessResponse(
      {
        work_item_comment_id: updatedComment.work_item_comment_id,
        work_item_id: updatedComment.work_item_id,
        parent_comment_id: updatedComment.parent_comment_id,
        comment_text: updatedComment.comment_text,
        created_by: updatedComment.created_by,
        created_by_name: updatedComment.created_by_name,
        created_at: updatedComment.created_at,
        updated_at: updatedComment.updated_at,
      },
      'Comment updated successfully'
    );
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Update work item comment failed', error, {
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
 * DELETE /api/work-items/[id]/comments/[commentId]
 * Delete a comment (soft delete)
 */
const deleteWorkItemCommentHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const validationStart = Date.now();
    const validatedParams = await extractRouteParams(args[0], workItemCommentParamsSchema);
    log.info('Request validation completed', { duration: Date.now() - validationStart });

    log.info('Delete work item comment request initiated', {
      requestingUserId: userContext.user_id,
      commentId: validatedParams.commentId,
    });

    // Create RBAC service
    const serviceStart = Date.now();
    const commentsService = createRBACWorkItemCommentsService(userContext);
    log.info('RBAC service created', { duration: Date.now() - serviceStart });

    // Delete comment with automatic permission checking
    const deleteStart = Date.now();
    await commentsService.deleteComment(validatedParams.commentId);
    log.db('UPDATE', 'work_item_comments', Date.now() - deleteStart, { rowCount: 1 });

    const totalDuration = Date.now() - startTime;
    log.info('Work item comment deleted successfully', {
      commentId: validatedParams.commentId,
      totalDuration,
    });

    return createSuccessResponse(null, 'Comment deleted successfully');
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Delete work item comment failed', error, {
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

export const PUT = rbacRoute(updateWorkItemCommentHandler, {
  permission: ['work-items:update:own', 'work-items:update:organization', 'work-items:update:all'],
  extractResourceId: extractors.workItemId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

export const DELETE = rbacRoute(deleteWorkItemCommentHandler, {
  permission: ['work-items:update:own', 'work-items:update:organization', 'work-items:update:all'],
  extractResourceId: extractors.workItemId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
