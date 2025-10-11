import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse, NotFoundError } from '@/lib/api/responses/error';
import { validateRequest } from '@/lib/api/middleware/validation';
import { extractRouteParams } from '@/lib/api/utils/params';
import { workItemCommentUpdateSchema, workItemCommentParamsSchema } from '@/lib/validations/work-items';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { createRBACWorkItemCommentsService } from '@/lib/services/rbac-work-item-comments-service';
import type { UserContext } from '@/lib/types/rbac';
import { log, logTemplates, calculateChanges } from '@/lib/logger';

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
    const validatedParams = await extractRouteParams(args[0], workItemCommentParamsSchema);
    const validatedData = await validateRequest(request, workItemCommentUpdateSchema);

    const commentsService = createRBACWorkItemCommentsService(userContext);
    const before = await commentsService.getComments({
      work_item_id: validatedParams.id,
      limit: 1000,
      offset: 0,
    });
    const beforeComment = before.find((c) => c.work_item_comment_id === validatedParams.commentId);

    if (!beforeComment) {
      throw NotFoundError('Work item comment');
    }

    const updatedComment = await commentsService.updateComment(validatedParams.commentId, {
      comment_text: validatedData.comment_text,
    });

    const duration = Date.now() - startTime;
    const changes = calculateChanges(
      { comment_text: beforeComment.comment_text },
      { comment_text: updatedComment.comment_text }
    );

    const template = logTemplates.crud.update('work_item_comment', {
      resourceId: String(updatedComment.work_item_comment_id),
      userId: userContext.user_id,
      changes,
      duration,
      metadata: {
        workItemId: updatedComment.work_item_id,
        isReply: !!updatedComment.parent_comment_id,
        commentLength: updatedComment.comment_text.length,
      },
    });

    log.info(template.message, template.context);

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
    log.error('work item comment update failed', error, {
      operation: 'update_work_item_comment',
      userId: userContext.user_id,
      component: 'work-items',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      error instanceof NotFoundError ? 404 : 500,
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
    const validatedParams = await extractRouteParams(args[0], workItemCommentParamsSchema);

    const commentsService = createRBACWorkItemCommentsService(userContext);
    const comments = await commentsService.getComments({
      work_item_id: validatedParams.id,
      limit: 1000,
      offset: 0,
    });
    const comment = comments.find((c) => c.work_item_comment_id === validatedParams.commentId);

    if (!comment) {
      throw NotFoundError('Work item comment');
    }

    await commentsService.deleteComment(validatedParams.commentId);

    const duration = Date.now() - startTime;
    const template = logTemplates.crud.delete('work_item_comment', {
      resourceId: String(comment.work_item_comment_id),
      userId: userContext.user_id,
      soft: true,
      duration,
      metadata: {
        workItemId: comment.work_item_id,
        wasReply: !!comment.parent_comment_id,
        commentLength: comment.comment_text.length,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse(null, 'Comment deleted successfully');
  } catch (error) {
    log.error('work item comment deletion failed', error, {
      operation: 'delete_work_item_comment',
      userId: userContext.user_id,
      component: 'work-items',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      error instanceof NotFoundError ? 404 : 500,
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
