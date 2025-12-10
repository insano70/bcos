import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';

import { db } from '@/lib/db';
import { users, work_item_attachments, work_items } from '@/lib/db/schema';
import { DatabaseError, NotFoundError } from '@/lib/errors/domain-errors';
import { PermissionDeniedError } from '@/lib/errors/rbac-errors';
import { log } from '@/lib/logger';
import {
  deleteFile,
  generateDownloadUrl,
  generateS3Key,
  generateUploadUrl,
} from '@/lib/s3/private-assets';
import { FILE_SIZE_LIMITS, IMAGE_MIME_TYPES } from '@/lib/s3/private-assets/constants';
import {
  BaseCrudService,
  type BaseQueryOptions,
  type CrudServiceConfig,
  type JoinQueryConfig,
} from '@/lib/services/crud';
import type { UserContext } from '@/lib/types/rbac';
import { formatUserNameWithFallback } from '@/lib/utils/user-formatters';

/**
 * Work Item Attachments Service with RBAC
 * Phase 2: Manages file attachments on work items with automatic permission checking
 *
 * Migrated to use BaseCrudService infrastructure with JOIN support.
 * Uses the generic private S3 assets system for secure file uploads with presigned URLs.
 */

export interface CreateWorkItemAttachmentData {
  work_item_id: string;
  file_name: string;
  file_size: number;
  file_type: string;
}

// Dummy update type since attachments are immutable after creation
type UpdateWorkItemAttachmentData = Record<string, never>;

export interface WorkItemAttachmentQueryOptions extends BaseQueryOptions {
  work_item_id: string;
}

export interface WorkItemAttachmentWithDetails {
  work_item_attachment_id: string;
  work_item_id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  s3_key: string;
  s3_bucket: string;
  uploaded_by: string;
  uploaded_by_name: string;
  uploaded_at: Date;
}

export class RBACWorkItemAttachmentsService extends BaseCrudService<
  typeof work_item_attachments,
  WorkItemAttachmentWithDetails,
  CreateWorkItemAttachmentData,
  UpdateWorkItemAttachmentData,
  WorkItemAttachmentQueryOptions
> {
  protected config: CrudServiceConfig<
    typeof work_item_attachments,
    WorkItemAttachmentWithDetails,
    CreateWorkItemAttachmentData,
    UpdateWorkItemAttachmentData,
    WorkItemAttachmentQueryOptions
  > = {
    table: work_item_attachments,
    resourceName: 'work-item-attachments',
    displayName: 'work item attachment',
    primaryKeyName: 'work_item_attachment_id',
    deletedAtColumnName: 'deleted_at',
    // No updatedAtColumnName - attachments are immutable
    permissions: {
      read: ['work-items:read:own', 'work-items:read:organization', 'work-items:read:all'],
      // Create/delete handled by custom methods due to S3 integration
    },
    transformers: {
      toEntity: (row: Record<string, unknown>): WorkItemAttachmentWithDetails => ({
        work_item_attachment_id: row.work_item_attachment_id as string,
        work_item_id: row.work_item_id as string,
        file_name: row.file_name as string,
        file_size: row.file_size as number,
        file_type: row.file_type as string,
        s3_key: row.s3_key as string,
        s3_bucket: row.s3_bucket as string,
        uploaded_by: row.uploaded_by as string,
        uploaded_by_name: formatUserNameWithFallback(
          row.uploaded_by_first_name as string | null,
          row.uploaded_by_last_name as string | null
        ),
        uploaded_at: (row.uploaded_at as Date) || new Date(),
      }),
    },
  };

  /**
   * Build JOIN query for attachment with user details
   */
  protected buildJoinQuery(): JoinQueryConfig {
    return {
      selectFields: {
        work_item_attachment_id: work_item_attachments.work_item_attachment_id,
        work_item_id: work_item_attachments.work_item_id,
        file_name: work_item_attachments.file_name,
        file_size: work_item_attachments.file_size,
        file_type: work_item_attachments.file_type,
        s3_key: work_item_attachments.s3_key,
        s3_bucket: work_item_attachments.s3_bucket,
        uploaded_by: work_item_attachments.uploaded_by,
        uploaded_by_first_name: users.first_name,
        uploaded_by_last_name: users.last_name,
        uploaded_at: work_item_attachments.uploaded_at,
      },
      joins: [
        {
          table: users,
          on: eq(work_item_attachments.uploaded_by, users.user_id),
          type: 'left',
        },
      ],
    };
  }

  /**
   * Build custom conditions for work_item_id filtering
   */
  protected buildCustomConditions(options: WorkItemAttachmentQueryOptions): SQL[] {
    const conditions: SQL[] = [];

    // Always filter by work_item_id (required)
    conditions.push(eq(work_item_attachments.work_item_id, options.work_item_id));

    return conditions;
  }

  /**
   * Validate parent work item access before listing attachments
   */
  protected async validateParentAccess(options: WorkItemAttachmentQueryOptions): Promise<void> {
    const canRead = await this.canReadWorkItem(options.work_item_id);
    if (!canRead) {
      throw new PermissionDeniedError('work-items:read:*', options.work_item_id);
    }
  }

  // ===========================================================================
  // Public API Methods - Maintain backward compatibility
  // ===========================================================================

  /**
   * Get attachments for a work item with permission checking
   */
  async getAttachments(
    options: WorkItemAttachmentQueryOptions
  ): Promise<WorkItemAttachmentWithDetails[]> {
    const startTime = Date.now();

    log.info('Work item attachments query initiated', {
      workItemId: options.work_item_id,
      requestingUserId: this.userContext.user_id,
    });

    const result = await this.getList({
      ...options,
      limit: options.limit ?? 1000,
      offset: options.offset ?? 0,
    });

    const duration = Date.now() - startTime;
    log.info('Work item attachments query completed', {
      workItemId: options.work_item_id,
      attachmentCount: result.items.length,
      duration,
    });

    // Sort by uploaded_at DESC (newest first)
    return result.items.sort(
      (a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
    );
  }

  /**
   * Get single attachment by ID with permission checking
   */
  async getAttachmentById(attachmentId: string): Promise<WorkItemAttachmentWithDetails | null> {
    const startTime = Date.now();

    log.info('Work item attachment fetch by ID initiated', {
      attachmentId,
      requestingUserId: this.userContext.user_id,
    });

    const attachment = await this.getById(attachmentId);

    if (!attachment) {
      const duration = Date.now() - startTime;
      log.info('Work item attachment not found', {
        attachmentId,
        duration,
      });
      return null;
    }

    // Verify user has permission to read the work item
    const canReadWorkItem = await this.canReadWorkItem(attachment.work_item_id);
    if (!canReadWorkItem) {
      throw new PermissionDeniedError('work-items:read:*', attachment.work_item_id);
    }

    const duration = Date.now() - startTime;
    log.info('Work item attachment fetch completed', {
      attachmentId,
      duration,
    });

    return attachment;
  }

  /**
   * Create new attachment and generate upload URL
   * Two-step process: 1) Create record with presigned URL, 2) Client uploads to S3
   * Custom implementation required for S3 presigned URL generation
   */
  async createAttachment(attachmentData: CreateWorkItemAttachmentData): Promise<{
    attachment: WorkItemAttachmentWithDetails;
    uploadUrl: string;
  }> {
    const startTime = Date.now();

    log.info('Work item attachment creation initiated', {
      workItemId: attachmentData.work_item_id,
      fileName: attachmentData.file_name,
      requestingUserId: this.userContext.user_id,
    });

    // Verify user has permission to update the work item (uploading is an update operation)
    const canUpdateWorkItem = await this.canUpdateWorkItem(attachmentData.work_item_id);
    if (!canUpdateWorkItem) {
      throw new PermissionDeniedError('work-items:update:*', attachmentData.work_item_id);
    }

    // Generate attachment ID for S3 key
    const attachmentId = crypto.randomUUID();

    // Generate S3 key using generic private assets pattern
    const s3Key = generateS3Key(
      ['work-items', attachmentData.work_item_id, 'attachments'],
      attachmentData.file_name
    );

    // Determine file size limit based on file type
    const isImage = IMAGE_MIME_TYPES.has(attachmentData.file_type);
    const maxFileSize = isImage ? FILE_SIZE_LIMITS.image : FILE_SIZE_LIMITS.document;

    // Generate presigned upload URL with metadata for audit trails
    const { uploadUrl, bucket } = await generateUploadUrl(s3Key, {
      contentType: attachmentData.file_type,
      expiresIn: 3600, // 1 hour
      maxFileSize, // Enforce size limit based on file type
      metadata: {
        resource_type: 'work_item_attachment',
        resource_id: attachmentData.work_item_id,
        attachment_id: attachmentId,
        uploaded_by: this.userContext.user_id,
      },
    });

    // Create attachment record
    const [newAttachment] = await db
      .insert(work_item_attachments)
      .values({
        work_item_attachment_id: attachmentId,
        work_item_id: attachmentData.work_item_id,
        file_name: attachmentData.file_name,
        file_size: attachmentData.file_size,
        file_type: attachmentData.file_type,
        s3_key: s3Key,
        s3_bucket: bucket,
        uploaded_by: this.userContext.user_id,
      })
      .returning();

    if (!newAttachment) {
      throw new DatabaseError('Failed to create attachment', 'write');
    }

    log.info('Work item attachment created successfully', {
      attachmentId: newAttachment.work_item_attachment_id,
      workItemId: attachmentData.work_item_id,
      s3Key,
      duration: Date.now() - startTime,
    });

    await this.logPermissionCheck('work-items:update:attachment', newAttachment.work_item_id);

    // Fetch and return the created attachment with full details via JOIN
    const attachmentWithDetails = await this.getAttachmentById(
      newAttachment.work_item_attachment_id
    );
    if (!attachmentWithDetails) {
      throw new DatabaseError('Failed to retrieve created attachment', 'read');
    }

    return {
      attachment: attachmentWithDetails,
      uploadUrl,
    };
  }

  /**
   * Generate download URL for an attachment
   * Requires work-items:read permission
   */
  async getDownloadUrl(attachmentId: string): Promise<string> {
    const startTime = Date.now();

    log.info('Generating download URL for attachment', {
      attachmentId,
      requestingUserId: this.userContext.user_id,
    });

    // Get attachment details (includes permission check via getAttachmentById)
    const attachment = await this.getAttachmentById(attachmentId);
    if (!attachment) {
      throw new NotFoundError('Attachment', attachmentId);
    }

    // Generate presigned download URL with short expiration for security
    const { downloadUrl } = await generateDownloadUrl(attachment.s3_key, {
      fileName: attachment.file_name,
      expiresIn: 900, // 15 minutes
      disposition: 'attachment',
    });

    log.info('Download URL generated', {
      attachmentId,
      duration: Date.now() - startTime,
    });

    return downloadUrl;
  }

  /**
   * Delete attachment (soft delete in DB, hard delete from S3)
   * Custom implementation required for S3 deletion
   */
  async deleteAttachment(attachmentId: string): Promise<void> {
    const startTime = Date.now();

    log.info('Work item attachment deletion initiated', {
      attachmentId,
      requestingUserId: this.userContext.user_id,
    });

    // First get the attachment to check work item permission
    const attachment = await this.getAttachmentById(attachmentId);
    if (!attachment) {
      throw new NotFoundError('Attachment', attachmentId);
    }

    // Verify user has permission to update the work item (deleting attachment is an update operation)
    const canUpdateWorkItem = await this.canUpdateWorkItem(attachment.work_item_id);
    if (!canUpdateWorkItem) {
      throw new PermissionDeniedError('work-items:update:*', attachment.work_item_id);
    }

    // Delete from S3
    await deleteFile(attachment.s3_key);

    // Soft delete in database
    await db
      .update(work_item_attachments)
      .set({
        deleted_at: new Date(),
      })
      .where(eq(work_item_attachments.work_item_attachment_id, attachmentId));

    log.info('Work item attachment deleted successfully', {
      attachmentId,
      s3Key: attachment.s3_key,
      duration: Date.now() - startTime,
    });

    await this.logPermissionCheck('work-items:update:attachment_delete', attachment.work_item_id);
  }

  /**
   * Get total attachment size for a work item
   * Useful for enforcing storage limits
   */
  async getTotalAttachmentSize(workItemId: string): Promise<number> {
    const startTime = Date.now();

    // Verify read permission
    const canReadWorkItem = await this.canReadWorkItem(workItemId);
    if (!canReadWorkItem) {
      throw new PermissionDeniedError('work-items:read:*', workItemId);
    }

    const [result] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${work_item_attachments.file_size}), 0)`,
      })
      .from(work_item_attachments)
      .where(
        and(
          eq(work_item_attachments.work_item_id, workItemId),
          isNull(work_item_attachments.deleted_at)
        )
      );

    log.info('Total attachment size calculated', {
      workItemId,
      totalSize: result?.total ?? 0,
      duration: Date.now() - startTime,
    });

    return Number(result?.total) || 0;
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

  /**
   * Helper: Check if user can update a work item
   */
  private async canUpdateWorkItem(workItemId: string): Promise<boolean> {
    const accessScope = this.getAccessScope('work-items', 'update');

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
 * Factory function to create RBACWorkItemAttachmentsService
 */
export function createRBACWorkItemAttachmentsService(
  userContext: UserContext
): RBACWorkItemAttachmentsService {
  return new RBACWorkItemAttachmentsService(userContext);
}
