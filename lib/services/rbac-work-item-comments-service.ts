import { and, eq, isNull, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db';
import { users, work_item_comments, work_items } from '@/lib/db/schema';
import { DatabaseError, NotFoundError } from '@/lib/errors/domain-errors';
import { PermissionDeniedError } from '@/lib/errors/rbac-errors';
import { log } from '@/lib/logger';
import {
  BaseCrudService,
  type BaseQueryOptions,
  type CrudServiceConfig,
  type JoinQueryConfig,
} from '@/lib/services/crud';
import type { UserContext } from '@/lib/types/rbac';
import { formatUserNameWithFallback } from '@/lib/utils/user-formatters';

/**
 * Work Item Comments Service with RBAC
 * Phase 2: Manages comments on work items with automatic permission checking
 *
 * Migrated to use BaseCrudService infrastructure with JOIN support.
 */

export interface CreateWorkItemCommentData {
  work_item_id: string;
  parent_comment_id?: string | null | undefined;
  comment_text: string;
}

export interface UpdateWorkItemCommentData {
  comment_text: string;
}

export interface WorkItemCommentQueryOptions extends BaseQueryOptions {
  work_item_id: string;
}

export interface WorkItemCommentWithDetails {
  work_item_comment_id: string;
  work_item_id: string;
  parent_comment_id: string | null;
  comment_text: string;
  created_by: string;
  created_by_name: string;
  created_at: Date;
  updated_at: Date;
}

export class RBACWorkItemCommentsService extends BaseCrudService<
  typeof work_item_comments,
  WorkItemCommentWithDetails,
  CreateWorkItemCommentData,
  UpdateWorkItemCommentData,
  WorkItemCommentQueryOptions
> {
  protected config: CrudServiceConfig<
    typeof work_item_comments,
    WorkItemCommentWithDetails,
    CreateWorkItemCommentData,
    UpdateWorkItemCommentData,
    WorkItemCommentQueryOptions
  > = {
    table: work_item_comments,
    resourceName: 'work-item-comments',
    displayName: 'work item comment',
    primaryKeyName: 'work_item_comment_id',
    deletedAtColumnName: 'deleted_at',
    updatedAtColumnName: 'updated_at',
    permissions: {
      read: ['work-items:read:own', 'work-items:read:organization', 'work-items:read:all'],
      // Create/update/delete handled by custom methods due to creator-or-admin logic
    },
    transformers: {
      toEntity: (row: Record<string, unknown>): WorkItemCommentWithDetails => ({
        work_item_comment_id: row.work_item_comment_id as string,
        work_item_id: row.work_item_id as string,
        parent_comment_id: row.parent_comment_id as string | null,
        comment_text: row.comment_text as string,
        created_by: row.created_by as string,
        created_by_name: formatUserNameWithFallback(
          row.created_by_first_name as string | null,
          row.created_by_last_name as string | null
        ),
        created_at: (row.created_at as Date) || new Date(),
        updated_at: (row.updated_at as Date) || new Date(),
      }),
      toCreateValues: (data, ctx) => ({
        work_item_id: data.work_item_id,
        parent_comment_id: data.parent_comment_id ?? null,
        comment_text: data.comment_text,
        created_by: ctx.user_id,
      }),
    },
  };

  /**
   * Build JOIN query for comment with user details
   */
  protected buildJoinQuery(): JoinQueryConfig {
    return {
      selectFields: {
        work_item_comment_id: work_item_comments.work_item_comment_id,
        work_item_id: work_item_comments.work_item_id,
        parent_comment_id: work_item_comments.parent_comment_id,
        comment_text: work_item_comments.comment_text,
        created_by: work_item_comments.created_by,
        created_by_first_name: users.first_name,
        created_by_last_name: users.last_name,
        created_at: work_item_comments.created_at,
        updated_at: work_item_comments.updated_at,
      },
      joins: [
        {
          table: users,
          on: eq(work_item_comments.created_by, users.user_id),
          type: 'left',
        },
      ],
    };
  }

  /**
   * Build custom conditions for work_item_id filtering
   */
  protected buildCustomConditions(options: WorkItemCommentQueryOptions): SQL[] {
    const conditions: SQL[] = [];

    // Always filter by work_item_id (required)
    conditions.push(eq(work_item_comments.work_item_id, options.work_item_id));

    return conditions;
  }

  /**
   * Validate parent work item access before listing comments
   */
  protected async validateParentAccess(options: WorkItemCommentQueryOptions): Promise<void> {
    const canRead = await this.canReadWorkItem(options.work_item_id);
    if (!canRead) {
      throw new PermissionDeniedError('work-items:read:*', options.work_item_id);
    }
  }

  // ===========================================================================
  // Public API Methods - Maintain backward compatibility
  // ===========================================================================

  /**
   * Get comments for a work item with permission checking
   */
  async getComments(options: WorkItemCommentQueryOptions): Promise<WorkItemCommentWithDetails[]> {
    const startTime = Date.now();

    log.info('Work item comments query initiated', {
      workItemId: options.work_item_id,
      requestingUserId: this.userContext.user_id,
    });

    const result = await this.getList({
      ...options,
      limit: options.limit ?? 1000,
      offset: options.offset ?? 0,
    });

    const duration = Date.now() - startTime;
    log.info('Work item comments query completed', {
      workItemId: options.work_item_id,
      commentCount: result.items.length,
      duration,
    });

    // Sort by created_at DESC (newest first)
    return result.items.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  /**
   * Get single comment by ID
   */
  async getCommentById(commentId: string): Promise<WorkItemCommentWithDetails | null> {
    return this.getById(commentId);
  }

  /**
   * Create new comment
   * Custom implementation to handle auto-watcher addition
   */
  async createComment(commentData: CreateWorkItemCommentData): Promise<WorkItemCommentWithDetails> {
    const startTime = Date.now();

    log.info('Work item comment creation initiated', {
      workItemId: commentData.work_item_id,
      requestingUserId: this.userContext.user_id,
    });

    // Verify user has permission to read/comment on the work item
    const canReadWorkItem = await this.canReadWorkItem(commentData.work_item_id);
    if (!canReadWorkItem) {
      throw new PermissionDeniedError('work-items:read:*', commentData.work_item_id);
    }

    // Create comment
    const [newComment] = await db
      .insert(work_item_comments)
      .values({
        work_item_id: commentData.work_item_id,
        parent_comment_id: commentData.parent_comment_id ?? null,
        comment_text: commentData.comment_text,
        created_by: this.userContext.user_id,
      })
      .returning();

    if (!newComment) {
      throw new DatabaseError('Failed to create comment', 'write');
    }

    log.info('Work item comment created successfully', {
      commentId: newComment.work_item_comment_id,
      workItemId: commentData.work_item_id,
      userId: this.userContext.user_id,
      duration: Date.now() - startTime,
    });

    // Phase 7: Auto-add commenter as watcher
    try {
      const { createRBACWorkItemWatchersService } = await import(
        './rbac-work-item-watchers-service'
      );
      const watchersService = createRBACWorkItemWatchersService(this.userContext);
      await watchersService.autoAddWatcher(
        commentData.work_item_id,
        this.userContext.user_id,
        'auto_commenter'
      );
      log.info('Auto-added commenter as watcher', {
        workItemId: commentData.work_item_id,
        userId: this.userContext.user_id,
      });
    } catch (error) {
      // Don't fail comment creation if watcher addition fails
      log.error('Failed to auto-add commenter as watcher', error, {
        workItemId: commentData.work_item_id,
        userId: this.userContext.user_id,
      });
    }

    // Fetch and return the comment with user details via JOIN
    const comment = await this.getCommentById(newComment.work_item_comment_id);
    if (!comment) {
      throw new DatabaseError('Failed to retrieve created comment', 'read');
    }

    return comment;
  }

  /**
   * Update comment (only by creator or admin)
   * Custom implementation due to creator-or-admin permission logic
   */
  async updateComment(
    commentId: string,
    updateData: UpdateWorkItemCommentData
  ): Promise<WorkItemCommentWithDetails> {
    const startTime = Date.now();

    log.info('Work item comment update initiated', {
      commentId,
      requestingUserId: this.userContext.user_id,
    });

    // Get the comment
    const comment = await this.getCommentById(commentId);
    if (!comment) {
      throw new NotFoundError('Comment', commentId);
    }

    // Check permission: user must be the creator or have admin permissions
    const isCreator = comment.created_by === this.userContext.user_id;
    const isAdmin = this.checker.hasPermission('work-items:manage:all');

    if (!isCreator && !isAdmin) {
      throw new PermissionDeniedError('work_item_comments:update', commentId);
    }

    // Update comment
    const [updatedComment] = await db
      .update(work_item_comments)
      .set({
        comment_text: updateData.comment_text,
        updated_at: new Date(),
      })
      .where(eq(work_item_comments.work_item_comment_id, commentId))
      .returning();

    if (!updatedComment) {
      throw new DatabaseError('Failed to update comment', 'write');
    }

    log.info('Work item comment updated successfully', {
      commentId,
      userId: this.userContext.user_id,
      duration: Date.now() - startTime,
    });

    // Fetch and return updated comment with user details via JOIN
    const updatedCommentWithDetails = await this.getCommentById(commentId);
    if (!updatedCommentWithDetails) {
      throw new DatabaseError('Failed to retrieve updated comment', 'read');
    }

    return updatedCommentWithDetails;
  }

  /**
   * Delete comment (soft delete, only by creator or admin)
   * Custom implementation due to creator-or-admin permission logic
   */
  async deleteComment(commentId: string): Promise<void> {
    const startTime = Date.now();

    log.info('Work item comment deletion initiated', {
      commentId,
      requestingUserId: this.userContext.user_id,
    });

    // Get the comment
    const comment = await this.getCommentById(commentId);
    if (!comment) {
      throw new NotFoundError('Comment', commentId);
    }

    // Check permission: user must be the creator or have admin permissions
    const isCreator = comment.created_by === this.userContext.user_id;
    const isAdmin = this.checker.hasPermission('work-items:manage:all');

    if (!isCreator && !isAdmin) {
      throw new PermissionDeniedError('work_item_comments:delete', commentId);
    }

    // Soft delete
    await db
      .update(work_item_comments)
      .set({
        deleted_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(work_item_comments.work_item_comment_id, commentId));

    log.info('Work item comment deleted successfully', {
      commentId,
      userId: this.userContext.user_id,
      duration: Date.now() - startTime,
    });
  }

  /**
   * Helper: Check if user can read a work item
   */
  private async canReadWorkItem(workItemId: string): Promise<boolean> {
    const accessScope = this.getAccessScope('work-items', 'read');

    // Get the work item to check organization
    const [workItem] = await db
      .select({
        organization_id: work_items.organization_id,
        created_by: work_items.created_by,
      })
      .from(work_items)
      .where(and(eq(work_items.work_item_id, workItemId), isNull(work_items.deleted_at)))
      .limit(1);

    if (!workItem) {
      return false;
    }

    switch (accessScope.scope) {
      case 'own':
        return workItem.created_by === this.userContext.user_id;

      case 'organization': {
        const accessibleOrgIds = accessScope.organizationIds || [];
        return accessibleOrgIds.includes(workItem.organization_id);
      }

      case 'all':
        return true;

      default:
        return false;
    }
  }
}

/**
 * Factory function to create RBACWorkItemCommentsService
 */
export function createRBACWorkItemCommentsService(
  userContext: UserContext
): RBACWorkItemCommentsService {
  return new RBACWorkItemCommentsService(userContext);
}
