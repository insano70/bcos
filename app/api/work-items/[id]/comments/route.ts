import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { validateRequest, validateQuery } from '@/lib/api/middleware/validation';
import { extractRouteParams } from '@/lib/api/utils/params';
import {
  workItemCommentCreateSchema,
  workItemCommentQuerySchema,
  workItemParamsSchema,
} from '@/lib/validations/work-items';
import { rbacRoute } from '@/lib/api/route-handlers';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { createRBACWorkItemCommentsService } from '@/lib/services/rbac-work-item-comments-service';
import type { UserContext } from '@/lib/types/rbac';
import { log, logTemplates, sanitizeFilters } from '@/lib/logger';

/**
 * GET /api/work-items/[id]/comments
 * Get comments for a work item
 */
const getWorkItemCommentsHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const validatedParams = await extractRouteParams(args[0], workItemParamsSchema);
    const query = validateQuery(searchParams, workItemCommentQuerySchema);

    const commentsService = createRBACWorkItemCommentsService(userContext);
    const comments = await commentsService.getComments({
      work_item_id: validatedParams.id,
      limit: query.limit,
      offset: query.offset,
    });

    const duration = Date.now() - startTime;
    const filters = sanitizeFilters({
      work_item_id: validatedParams.id,
      limit: query.limit,
      offset: query.offset,
    });

    const parentComments = comments.filter((c) => !c.parent_comment_id).length;
    const replyComments = comments.length - parentComments;

    log.info(`work item comments list completed - returned ${comments.length} comments`, {
      operation: 'list_work_item_comments',
      resourceType: 'work_item_comments',
      userId: userContext.user_id,
      filters,
      results: {
        returned: comments.length,
        parents: parentComments,
        replies: replyComments,
      },
      duration,
      slow: duration > 1000,
      component: 'work-items',
    });

    return createSuccessResponse(
      comments.map((comment) => ({
        work_item_comment_id: comment.work_item_comment_id,
        work_item_id: comment.work_item_id,
        parent_comment_id: comment.parent_comment_id,
        comment_text: comment.comment_text,
        created_by: comment.created_by,
        created_by_name: comment.created_by_name,
        created_at: comment.created_at,
        updated_at: comment.updated_at,
      }))
    );
  } catch (error) {
    log.error('work item comments list failed', error, {
      operation: 'list_work_item_comments',
      userId: userContext.user_id,
      component: 'work-items',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

/**
 * POST /api/work-items/[id]/comments
 * Create a new comment on a work item
 */
const createWorkItemCommentHandler = async (
  request: NextRequest,
  userContext: UserContext,
  ...args: unknown[]
) => {
  const startTime = Date.now();

  try {
    const validatedParams = await extractRouteParams(args[0], workItemParamsSchema);
    const validatedData = await validateRequest(request, workItemCommentCreateSchema);

    const commentsService = createRBACWorkItemCommentsService(userContext);
    const newComment = await commentsService.createComment({
      work_item_id: validatedParams.id,
      parent_comment_id: validatedData.parent_comment_id,
      comment_text: validatedData.comment_text,
    });

    // Add commenter as watcher (auto-watcher logic)
    let watcherAdded = false;
    const { createRBACWorkItemWatchersService } = await import('@/lib/services/rbac-work-item-watchers-service');
    const watchersService = createRBACWorkItemWatchersService(userContext);

    try {
      const existingWatchers = await watchersService.getWatchersForWorkItem(validatedParams.id);
      const isAlreadyWatcher = existingWatchers.some(
        (w) => w.user_id === userContext.user_id
      );

      if (!isAlreadyWatcher) {
        await watchersService.addWatcher({
          work_item_id: validatedParams.id,
          user_id: userContext.user_id,
          watch_type: 'auto_commenter',
          notify_status_changes: true,
          notify_comments: true,
          notify_assignments: true,
          notify_due_date: true,
        });
        watcherAdded = true;
      }
    } catch (error) {
      log.error('failed to add commenter as watcher', error, {
        workItemId: validatedParams.id,
        userId: userContext.user_id,
      });
    }

    const duration = Date.now() - startTime;
    const template = logTemplates.crud.create('work_item_comment', {
      resourceId: String(newComment.work_item_comment_id),
      userId: userContext.user_id,
      duration,
      metadata: {
        workItemId: newComment.work_item_id,
        isReply: !!newComment.parent_comment_id,
        parentCommentId: newComment.parent_comment_id,
        commentLength: newComment.comment_text.length,
        watcherAdded,
      },
    });

    log.info(template.message, template.context);

    return createSuccessResponse(
      {
        work_item_comment_id: newComment.work_item_comment_id,
        work_item_id: newComment.work_item_id,
        parent_comment_id: newComment.parent_comment_id,
        comment_text: newComment.comment_text,
        created_by: newComment.created_by,
        created_by_name: newComment.created_by_name,
        created_at: newComment.created_at,
        updated_at: newComment.updated_at,
      },
      'Comment created successfully'
    );
  } catch (error) {
    log.error('work item comment creation failed', error, {
      operation: 'create_work_item_comment',
      userId: userContext.user_id,
      component: 'work-items',
    });

    return createErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500,
      request
    );
  }
};

export const GET = rbacRoute(getWorkItemCommentsHandler, {
  permission: ['work-items:read:own', 'work-items:read:organization', 'work-items:read:all'],
  extractResourceId: extractors.workItemId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});

export const POST = rbacRoute(createWorkItemCommentHandler, {
  permission: ['work-items:update:own', 'work-items:update:organization', 'work-items:update:all'],
  extractResourceId: extractors.workItemId,
  extractOrganizationId: extractors.organizationId,
  rateLimit: 'api',
});
