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
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { extractors } from '@/lib/api/utils/rbac-extractors';
import { createRBACWorkItemCommentsService } from '@/lib/services/rbac-work-item-comments-service';
import type { UserContext } from '@/lib/types/rbac';
import { log } from '@/lib/logger';

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
    const validationStart = Date.now();
    const validatedParams = await extractRouteParams(args[0], workItemParamsSchema);
    const query = validateQuery(searchParams, workItemCommentQuerySchema);
    log.info('Request validation completed', { duration: Date.now() - validationStart });

    log.info('Get work item comments request initiated', {
      requestingUserId: userContext.user_id,
      workItemId: validatedParams.id,
    });

    // Create RBAC service
    const serviceStart = Date.now();
    const commentsService = createRBACWorkItemCommentsService(userContext);
    log.info('RBAC service created', { duration: Date.now() - serviceStart });

    // Get comments with automatic permission checking
    const commentsStart = Date.now();
    const comments = await commentsService.getComments({
      work_item_id: validatedParams.id,
      limit: query.limit,
      offset: query.offset,
    });
    log.db('SELECT', 'work_item_comments', Date.now() - commentsStart, { rowCount: comments.length });

    const totalDuration = Date.now() - startTime;
    log.info('Work item comments retrieved successfully', {
      workItemId: validatedParams.id,
      commentCount: comments.length,
      totalDuration,
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
    const totalDuration = Date.now() - startTime;

    log.error('Get work item comments failed', error, {
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
    const validationStart = Date.now();
    const validatedParams = await extractRouteParams(args[0], workItemParamsSchema);
    const validatedData = await validateRequest(request, workItemCommentCreateSchema);
    log.info('Request validation completed', { duration: Date.now() - validationStart });

    log.info('Create work item comment request initiated', {
      requestingUserId: userContext.user_id,
      workItemId: validatedParams.id,
    });

    // Create RBAC service
    const serviceStart = Date.now();
    const commentsService = createRBACWorkItemCommentsService(userContext);
    log.info('RBAC service created', { duration: Date.now() - serviceStart });

    // Create comment with automatic permission checking
    const commentCreationStart = Date.now();
    const newComment = await commentsService.createComment({
      work_item_id: validatedParams.id,
      parent_comment_id: validatedData.parent_comment_id,
      comment_text: validatedData.comment_text,
    });
    log.db('INSERT', 'work_item_comments', Date.now() - commentCreationStart, { rowCount: 1 });

    const totalDuration = Date.now() - startTime;
    log.info('Work item comment created successfully', {
      commentId: newComment.work_item_comment_id,
      workItemId: validatedParams.id,
      totalDuration,
    });

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
    const totalDuration = Date.now() - startTime;

    log.error('Create work item comment failed', error, {
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
