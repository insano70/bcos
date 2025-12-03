import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  users,
  work_item_attachments,
  work_item_field_values,
  work_item_fields,
  work_items,
} from '@/lib/db/schema';
import { PermissionDeniedError } from '@/lib/errors/rbac-errors';
import { log } from '@/lib/logger';
import { BaseRBACService } from '@/lib/rbac/base-service';
import {
  deleteFile,
  fileExists,
  generateDownloadUrl,
  generateS3Key,
  generateUploadUrl,
  getThumbnailKey,
  isImage,
} from '@/lib/s3/private-assets';
import { FILE_SIZE_LIMITS, IMAGE_MIME_TYPES } from '@/lib/s3/private-assets/constants';
import type { UserContext } from '@/lib/types/rbac';
import type { AttachmentFieldConfig } from '@/lib/types/work-item-fields';
import { formatUserNameWithFallback } from '@/lib/utils/user-formatters';

/**
 * Attachment Field Service with RBAC
 * Manages file attachments on custom fields with automatic field value synchronization
 */

export interface CreateFieldAttachmentData {
  work_item_id: string;
  work_item_field_id: string;
  file_name: string;
  file_size: number;
  file_type: string;
}

export interface FieldAttachmentWithDetails {
  work_item_attachment_id: string;
  work_item_id: string;
  work_item_field_id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  s3_key: string;
  s3_bucket: string;
  uploaded_by: string;
  uploaded_by_name: string;
  uploaded_at: Date;
  is_image?: boolean;
  has_thumbnail?: boolean;
}

export class AttachmentFieldService extends BaseRBACService {
  /**
   * Get attachments for a specific custom field
   */
  async getFieldAttachments(
    workItemId: string,
    fieldId: string
  ): Promise<FieldAttachmentWithDetails[]> {
    const startTime = Date.now();

    log.info('Field attachments query initiated', {
      workItemId,
      fieldId,
      requestingUserId: this.userContext.user_id,
    });

    // Verify user has permission to read the work item
    await this.verifyWorkItemReadPermission(workItemId);

    // Verify field exists and is attachment type
    await this.verifyAttachmentField(fieldId);

    const results = await db
      .select({
        work_item_attachment_id: work_item_attachments.work_item_attachment_id,
        work_item_id: work_item_attachments.work_item_id,
        work_item_field_id: work_item_attachments.work_item_field_id,
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
          eq(work_item_attachments.work_item_id, workItemId),
          eq(work_item_attachments.work_item_field_id, fieldId),
          isNull(work_item_attachments.deleted_at)
        )
      )
      .orderBy(desc(work_item_attachments.uploaded_at));

    log.info('Field attachments query completed', {
      workItemId,
      fieldId,
      attachmentCount: results.length,
      duration: Date.now() - startTime,
    });

    return results.map((result) => {
      const isImageFile = isImage(result.file_type);
      return {
        work_item_attachment_id: result.work_item_attachment_id,
        work_item_id: result.work_item_id,
        work_item_field_id: result.work_item_field_id ?? '',
        file_name: result.file_name,
        file_size: result.file_size,
        file_type: result.file_type,
        s3_key: result.s3_key,
        s3_bucket: result.s3_bucket,
        uploaded_by: result.uploaded_by,
        uploaded_by_name: formatUserNameWithFallback(result.uploaded_by_first_name, result.uploaded_by_last_name),
        uploaded_at: result.uploaded_at || new Date(),
        is_image: isImageFile,
        has_thumbnail: false, // Will be checked lazily on demand
      };
    });
  }

  /**
   * Get single field attachment by ID
   */
  async getFieldAttachmentById(attachmentId: string): Promise<FieldAttachmentWithDetails | null> {
    const startTime = Date.now();

    log.info('Field attachment fetch by ID initiated', {
      attachmentId,
      requestingUserId: this.userContext.user_id,
    });

    const results = await db
      .select({
        work_item_attachment_id: work_item_attachments.work_item_attachment_id,
        work_item_id: work_item_attachments.work_item_id,
        work_item_field_id: work_item_attachments.work_item_field_id,
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

    // Verify this is a field attachment
    if (!attachment.work_item_field_id) {
      throw new Error('Attachment is not associated with a custom field');
    }

    // Verify user has permission to read the work item
    await this.verifyWorkItemReadPermission(attachment.work_item_id);

    log.info('Field attachment fetch completed', {
      attachmentId,
      duration: Date.now() - startTime,
    });

    return {
      work_item_attachment_id: attachment.work_item_attachment_id,
      work_item_id: attachment.work_item_id,
      work_item_field_id: attachment.work_item_field_id,
      file_name: attachment.file_name,
      file_size: attachment.file_size,
      file_type: attachment.file_type,
      s3_key: attachment.s3_key,
      s3_bucket: attachment.s3_bucket,
      uploaded_by: attachment.uploaded_by,
      uploaded_by_name: formatUserNameWithFallback(attachment.uploaded_by_first_name, attachment.uploaded_by_last_name),
      uploaded_at: attachment.uploaded_at || new Date(),
    };
  }

  /**
   * Create new field attachment and generate upload URL
   * Validates field configuration (max_files) and updates field value
   */
  async createFieldAttachment(attachmentData: CreateFieldAttachmentData): Promise<{
    attachment: FieldAttachmentWithDetails;
    uploadUrl: string;
  }> {
    const startTime = Date.now();

    log.info('Field attachment creation initiated', {
      workItemId: attachmentData.work_item_id,
      fieldId: attachmentData.work_item_field_id,
      fileName: attachmentData.file_name,
      requestingUserId: this.userContext.user_id,
    });

    // Verify user has permission to update the work item
    await this.verifyWorkItemUpdatePermission(attachmentData.work_item_id);

    // Get field definition and verify it's attachment type
    const field = await this.verifyAttachmentField(attachmentData.work_item_field_id);

    // Validate max_files limit
    await this.validateMaxFilesLimit(
      attachmentData.work_item_id,
      attachmentData.work_item_field_id,
      field.field_config?.attachment_config
    );

    // Generate attachment ID for S3 key
    const attachmentId = crypto.randomUUID();

    // Generate S3 key with field-specific path
    const s3Key = generateS3Key(
      ['work-items', attachmentData.work_item_id, 'fields', attachmentData.work_item_field_id],
      attachmentData.file_name
    );

    // Determine file size limit based on file type
    const isImage = IMAGE_MIME_TYPES.has(attachmentData.file_type);
    const maxFileSize = isImage ? FILE_SIZE_LIMITS.image : FILE_SIZE_LIMITS.document;

    // Generate presigned upload URL
    const { uploadUrl, bucket } = await generateUploadUrl(s3Key, {
      contentType: attachmentData.file_type,
      expiresIn: 3600, // 1 hour
      maxFileSize,
      metadata: {
        resource_type: 'work_item_field_attachment',
        resource_id: attachmentData.work_item_id,
        field_id: attachmentData.work_item_field_id,
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
        work_item_field_id: attachmentData.work_item_field_id,
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

    // Update field value to add attachment ID
    await this.addAttachmentToFieldValue(
      attachmentData.work_item_id,
      attachmentData.work_item_field_id,
      attachmentId
    );

    log.info('Field attachment created successfully', {
      attachmentId: newAttachment.work_item_attachment_id,
      workItemId: attachmentData.work_item_id,
      fieldId: attachmentData.work_item_field_id,
      s3Key,
      duration: Date.now() - startTime,
    });

    await this.logPermissionCheck(
      'work-items:update:field_attachment',
      newAttachment.work_item_id
    );

    // Fetch and return the created attachment with full details
    const attachmentWithDetails = await this.getFieldAttachmentById(
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
   * Generate download URL for a field attachment
   */
  async getDownloadUrl(attachmentId: string): Promise<string> {
    const startTime = Date.now();

    log.info('Generating download URL for field attachment', {
      attachmentId,
      requestingUserId: this.userContext.user_id,
    });

    // Get attachment details
    const attachment = await this.getFieldAttachmentById(attachmentId);
    if (!attachment) {
      throw new Error('Attachment not found');
    }

    // Generate presigned download URL
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
   * Generate thumbnail download URL for an image attachment
   * Returns null if attachment is not an image or thumbnail doesn't exist
   */
  async getThumbnailUrl(attachmentId: string): Promise<string | null> {
    const startTime = Date.now();

    log.info('Generating thumbnail URL for field attachment', {
      attachmentId,
      requestingUserId: this.userContext.user_id,
    });

    // Get attachment details
    const attachment = await this.getFieldAttachmentById(attachmentId);
    if (!attachment) {
      throw new Error('Attachment not found');
    }

    // Check if it's an image
    if (!isImage(attachment.file_type)) {
      log.info('Attachment is not an image, no thumbnail available', {
        attachmentId,
        fileType: attachment.file_type,
      });
      return null;
    }

    // Get thumbnail S3 key
    const thumbnailKey = getThumbnailKey(attachment.s3_key);

    // Check if thumbnail exists
    const thumbnailExists = await fileExists(thumbnailKey);
    if (!thumbnailExists) {
      log.info('Thumbnail does not exist for image', {
        attachmentId,
        thumbnailKey,
      });
      return null;
    }

    // Generate presigned download URL for thumbnail
    const { downloadUrl } = await generateDownloadUrl(thumbnailKey, {
      fileName: `thumb_${attachment.file_name}`,
      expiresIn: 900, // 15 minutes
      disposition: 'inline', // Display in browser
    });

    log.info('Thumbnail URL generated', {
      attachmentId,
      duration: Date.now() - startTime,
    });

    return downloadUrl;
  }

  /**
   * Delete field attachment and update field value
   */
  async deleteFieldAttachment(attachmentId: string): Promise<void> {
    const startTime = Date.now();

    log.info('Field attachment deletion initiated', {
      attachmentId,
      requestingUserId: this.userContext.user_id,
    });

    // Get the attachment to check work item permission
    const attachment = await this.getFieldAttachmentById(attachmentId);
    if (!attachment) {
      throw new Error('Attachment not found');
    }

    // Verify user has permission to update the work item
    await this.verifyWorkItemUpdatePermission(attachment.work_item_id);

    // Delete from S3
    await deleteFile(attachment.s3_key);

    // Soft delete in database
    await db
      .update(work_item_attachments)
      .set({
        deleted_at: new Date(),
      })
      .where(eq(work_item_attachments.work_item_attachment_id, attachmentId));

    // Update field value to remove attachment ID
    await this.removeAttachmentFromFieldValue(
      attachment.work_item_id,
      attachment.work_item_field_id,
      attachmentId
    );

    log.info('Field attachment deleted successfully', {
      attachmentId,
      s3Key: attachment.s3_key,
      duration: Date.now() - startTime,
    });

    await this.logPermissionCheck(
      'work-items:update:field_attachment_delete',
      attachment.work_item_id
    );
  }

  /**
   * Verify field exists and is attachment type
   */
  private async verifyAttachmentField(fieldId: string): Promise<{
    work_item_field_id: string;
    field_type: string;
    field_name: string;
    field_config: { attachment_config?: AttachmentFieldConfig } | null;
  }> {
    const [field] = await db
      .select({
        work_item_field_id: work_item_fields.work_item_field_id,
        field_type: work_item_fields.field_type,
        field_name: work_item_fields.field_name,
        field_config: work_item_fields.field_config,
      })
      .from(work_item_fields)
      .where(and(eq(work_item_fields.work_item_field_id, fieldId), isNull(work_item_fields.deleted_at)))
      .limit(1);

    if (!field) {
      throw new Error(`Field ${fieldId} not found`);
    }

    if (field.field_type !== 'attachment') {
      throw new Error(`Field ${field.field_name} is not an attachment field`);
    }

    return field;
  }

  /**
   * Validate max_files limit for field
   */
  private async validateMaxFilesLimit(
    workItemId: string,
    fieldId: string,
    attachmentConfig?: AttachmentFieldConfig
  ): Promise<void> {
    const maxFiles = attachmentConfig?.max_files;

    // null or undefined = unlimited
    if (maxFiles === null || maxFiles === undefined) {
      return;
    }

    // Get current attachment count for this field
    const currentAttachments = await this.getFieldAttachments(workItemId, fieldId);

    if (currentAttachments.length >= maxFiles) {
      throw new Error(
        `Maximum number of attachments (${maxFiles}) reached for this field`
      );
    }
  }

  /**
   * Add attachment ID to field value
   */
  private async addAttachmentToFieldValue(
    workItemId: string,
    fieldId: string,
    attachmentId: string
  ): Promise<void> {
    // Get existing field value
    const [existingValue] = await db
      .select({
        work_item_field_value_id: work_item_field_values.work_item_field_value_id,
        field_value: work_item_field_values.field_value,
      })
      .from(work_item_field_values)
      .where(
        and(
          eq(work_item_field_values.work_item_id, workItemId),
          eq(work_item_field_values.work_item_field_id, fieldId)
        )
      )
      .limit(1);

    let attachmentIds: string[] = [];

    if (existingValue) {
      // Extract existing attachment IDs
      const currentValue = existingValue.field_value as { attachment_ids?: string[] };
      attachmentIds = currentValue?.attachment_ids || [];

      // Add new attachment ID if not already present
      if (!attachmentIds.includes(attachmentId)) {
        attachmentIds.push(attachmentId);
      }

      // Update existing value
      await db
        .update(work_item_field_values)
        .set({
          field_value: { attachment_ids: attachmentIds },
          updated_at: new Date(),
        })
        .where(eq(work_item_field_values.work_item_field_value_id, existingValue.work_item_field_value_id));

      log.info('Field value updated with attachment ID', {
        workItemId,
        fieldId,
        attachmentId,
        totalAttachments: attachmentIds.length,
      });
    } else {
      // Create new field value
      await db.insert(work_item_field_values).values({
        work_item_id: workItemId,
        work_item_field_id: fieldId,
        field_value: { attachment_ids: [attachmentId] },
      });

      log.info('Field value created with attachment ID', {
        workItemId,
        fieldId,
        attachmentId,
      });
    }
  }

  /**
   * Remove attachment ID from field value
   */
  private async removeAttachmentFromFieldValue(
    workItemId: string,
    fieldId: string,
    attachmentId: string
  ): Promise<void> {
    // Get existing field value
    const [existingValue] = await db
      .select({
        work_item_field_value_id: work_item_field_values.work_item_field_value_id,
        field_value: work_item_field_values.field_value,
      })
      .from(work_item_field_values)
      .where(
        and(
          eq(work_item_field_values.work_item_id, workItemId),
          eq(work_item_field_values.work_item_field_id, fieldId)
        )
      )
      .limit(1);

    if (!existingValue) {
      log.info('No field value found to update', { workItemId, fieldId, attachmentId });
      return;
    }

    // Extract existing attachment IDs
    const currentValue = existingValue.field_value as { attachment_ids?: string[] };
    let attachmentIds = currentValue?.attachment_ids || [];

    // Remove the attachment ID
    attachmentIds = attachmentIds.filter((id) => id !== attachmentId);

    // Update field value
    await db
      .update(work_item_field_values)
      .set({
        field_value: { attachment_ids: attachmentIds },
        updated_at: new Date(),
      })
      .where(eq(work_item_field_values.work_item_field_value_id, existingValue.work_item_field_value_id));

    log.info('Field value updated - removed attachment ID', {
      workItemId,
      fieldId,
      attachmentId,
      remainingAttachments: attachmentIds.length,
    });
  }

  /**
   * Verify user has permission to read a work item
   */
  private async verifyWorkItemReadPermission(workItemId: string): Promise<void> {
    const canReadOwn = this.checker.hasPermission('work-items:read:own', workItemId);
    const canReadOrg = this.checker.hasPermission('work-items:read:organization');
    const canReadAll = this.checker.hasPermission('work-items:read:all');

    if (!canReadOwn && !canReadOrg && !canReadAll) {
      throw new PermissionDeniedError('work-items:read:*', workItemId);
    }

    // If org or all scope, verify organization access
    if ((canReadOrg || canReadAll) && !canReadAll) {
      const [workItem] = await db
        .select({ organization_id: work_items.organization_id })
        .from(work_items)
        .where(eq(work_items.work_item_id, workItemId))
        .limit(1);

      if (!workItem) {
        throw new Error('Work item not found');
      }

      if (!this.canAccessOrganization(workItem.organization_id)) {
        throw new PermissionDeniedError('work-items:read:organization', workItemId);
      }
    }
  }

  /**
   * Verify user has permission to update a work item
   */
  private async verifyWorkItemUpdatePermission(workItemId: string): Promise<void> {
    const canUpdateOwn = this.checker.hasPermission('work-items:update:own', workItemId);
    const canUpdateOrg = this.checker.hasPermission('work-items:update:organization');
    const canUpdateAll = this.checker.hasPermission('work-items:update:all');

    if (!canUpdateOwn && !canUpdateOrg && !canUpdateAll) {
      throw new PermissionDeniedError('work-items:update:*', workItemId);
    }

    // If org or all scope, verify organization access
    if ((canUpdateOrg || canUpdateAll) && !canUpdateAll) {
      const [workItem] = await db
        .select({ organization_id: work_items.organization_id })
        .from(work_items)
        .where(eq(work_items.work_item_id, workItemId))
        .limit(1);

      if (!workItem) {
        throw new Error('Work item not found');
      }

      if (!this.canAccessOrganization(workItem.organization_id)) {
        throw new PermissionDeniedError('work-items:update:organization', workItemId);
      }
    }
  }
}

/**
 * Factory function to create AttachmentFieldService
 */
export function createAttachmentFieldService(
  userContext: UserContext
): AttachmentFieldService {
  return new AttachmentFieldService(userContext);
}
