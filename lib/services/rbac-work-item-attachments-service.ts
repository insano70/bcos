import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, work_item_attachments, work_items } from '@/lib/db/schema';
import { log } from '@/lib/logger';
import { BaseRBACService } from '@/lib/rbac/base-service';
import {
  deleteFile,
  generateDownloadUrl,
  generateUploadUrl,
} from '@/lib/s3/work-items-attachments';
import type { UserContext } from '@/lib/types/rbac';
import { PermissionDeniedError } from '@/lib/types/rbac';

/**
 * Work Item Attachments Service with RBAC
 * Phase 2: Manages file attachments on work items with automatic permission checking
 */

export interface CreateWorkItemAttachmentData {
  work_item_id: string;
  file_name: string;
  file_size: number;
  file_type: string;
}

export interface WorkItemAttachmentQueryOptions {
  work_item_id: string;
  limit?: number | undefined;
  offset?: number | undefined;
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

export class RBACWorkItemAttachmentsService extends BaseRBACService {
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

    // First verify user has permission to read the work item
    const canReadWorkItem = await this.canReadWorkItem(options.work_item_id);
    if (!canReadWorkItem) {
      throw new PermissionDeniedError('work-items:read:*', options.work_item_id);
    }

    // Fetch attachments
    const results = await db
      .select({
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
      })
      .from(work_item_attachments)
      .leftJoin(users, eq(work_item_attachments.uploaded_by, users.user_id))
      .where(
        and(
          eq(work_item_attachments.work_item_id, options.work_item_id),
          isNull(work_item_attachments.deleted_at)
        )
      )
      .orderBy(desc(work_item_attachments.uploaded_at))
      .limit(options.limit || 50)
      .offset(options.offset || 0);

    const duration = Date.now() - startTime;
    log.info('Work item attachments query completed', {
      workItemId: options.work_item_id,
      attachmentCount: results.length,
      duration,
    });

    return results.map((result) => ({
      work_item_attachment_id: result.work_item_attachment_id,
      work_item_id: result.work_item_id,
      file_name: result.file_name,
      file_size: result.file_size,
      file_type: result.file_type,
      s3_key: result.s3_key,
      s3_bucket: result.s3_bucket,
      uploaded_by: result.uploaded_by,
      uploaded_by_name:
        result.uploaded_by_first_name && result.uploaded_by_last_name
          ? `${result.uploaded_by_first_name} ${result.uploaded_by_last_name}`
          : '',
      uploaded_at: result.uploaded_at || new Date(),
    }));
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

    // Fetch the attachment
    const results = await db
      .select({
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
      })
      .from(work_item_attachments)
      .leftJoin(users, eq(work_item_attachments.uploaded_by, users.user_id))
      .where(
        and(
          eq(work_item_attachments.work_item_attachment_id, attachmentId),
          isNull(work_item_attachments.deleted_at)
        )
      )
      .limit(1);

    if (results.length === 0) {
      return null;
    }

    const attachment = results[0];
    if (!attachment) {
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

    return {
      work_item_attachment_id: attachment.work_item_attachment_id,
      work_item_id: attachment.work_item_id,
      file_name: attachment.file_name,
      file_size: attachment.file_size,
      file_type: attachment.file_type,
      s3_key: attachment.s3_key,
      s3_bucket: attachment.s3_bucket,
      uploaded_by: attachment.uploaded_by,
      uploaded_by_name:
        attachment.uploaded_by_first_name && attachment.uploaded_by_last_name
          ? `${attachment.uploaded_by_first_name} ${attachment.uploaded_by_last_name}`
          : '',
      uploaded_at: attachment.uploaded_at || new Date(),
    };
  }

  /**
   * Create new attachment and generate upload URL
   * Two-step process: 1) Create record with presigned URL, 2) Client uploads to S3
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

    // Generate presigned upload URL
    const { uploadUrl, s3Key, bucket } = await generateUploadUrl(
      attachmentData.work_item_id,
      attachmentId,
      attachmentData.file_name,
      attachmentData.file_type
    );

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
      throw new Error('Failed to create attachment');
    }

    log.info('Work item attachment created successfully', {
      attachmentId: newAttachment.work_item_attachment_id,
      workItemId: attachmentData.work_item_id,
      s3Key,
      duration: Date.now() - startTime,
    });

    await this.logPermissionCheck('work-items:update:attachment', newAttachment.work_item_id);

    // Fetch and return the created attachment with full details
    const attachmentWithDetails = await this.getAttachmentById(
      newAttachment.work_item_attachment_id
    );
    if (!attachmentWithDetails) {
      throw new Error('Failed to retrieve created attachment');
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

    // Get attachment details
    const attachment = await this.getAttachmentById(attachmentId);
    if (!attachment) {
      throw new Error('Attachment not found');
    }

    // Generate download URL
    const downloadUrl = await generateDownloadUrl(attachment.s3_key, attachment.file_name);

    log.info('Download URL generated', {
      attachmentId,
      duration: Date.now() - startTime,
    });

    return downloadUrl;
  }

  /**
   * Delete attachment (soft delete in DB, hard delete from S3)
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
      throw new Error('Attachment not found');
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
   * Helper method to check if user can read a work item
   */
  private async canReadWorkItem(workItemId: string): Promise<boolean> {
    const canReadOwn = this.checker.hasPermission('work-items:read:own', workItemId);
    const canReadOrg = this.checker.hasPermission('work-items:read:organization');
    const canReadAll = this.checker.hasPermission('work-items:read:all');

    if (!canReadOwn && !canReadOrg && !canReadAll) {
      return false;
    }

    // If org or all scope, verify organization access
    if ((canReadOrg || canReadAll) && !canReadAll) {
      const [workItem] = await db
        .select({ organization_id: work_items.organization_id })
        .from(work_items)
        .where(eq(work_items.work_item_id, workItemId))
        .limit(1);

      if (!workItem) {
        return false;
      }

      return this.canAccessOrganization(workItem.organization_id);
    }

    return true;
  }

  /**
   * Helper method to check if user can update a work item
   */
  private async canUpdateWorkItem(workItemId: string): Promise<boolean> {
    const canUpdateOwn = this.checker.hasPermission('work-items:update:own', workItemId);
    const canUpdateOrg = this.checker.hasPermission('work-items:update:organization');
    const canUpdateAll = this.checker.hasPermission('work-items:update:all');

    if (!canUpdateOwn && !canUpdateOrg && !canUpdateAll) {
      return false;
    }

    // If org or all scope, verify organization access
    if ((canUpdateOrg || canUpdateAll) && !canUpdateAll) {
      const [workItem] = await db
        .select({ organization_id: work_items.organization_id })
        .from(work_items)
        .where(eq(work_items.work_item_id, workItemId))
        .limit(1);

      if (!workItem) {
        return false;
      }

      return this.canAccessOrganization(workItem.organization_id);
    }

    return true;
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
