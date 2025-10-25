/**
 * S3 Private Assets Service
 * 
 * Generic, reusable service for secure file uploads with presigned URLs.
 * Supports any resource type requiring access control and authentication.
 * 
 * ## Architecture
 * 
 * - **Separate Credentials**: Uses S3_PRIVATE_* env vars for security isolation
 * - **Presigned URLs**: Client uploads/downloads directly to S3 (no server bandwidth)
 * - **Access Control**: All files require authentication and authorization
 * - **Consistent API**: Identical key generation pattern as public assets
 * - **Flexible Paths**: Supports nested resource hierarchies
 * - **Security First**: Path traversal prevention, filename sanitization
 * 
 * ## Usage Pattern
 * 
 * ### Two-Step Upload Flow
 * 
 * ```typescript
 * // Step 1: Server generates presigned URL and creates DB record
 * import { generateS3Key, generateUploadUrl } from '@/lib/s3/private-assets';
 * 
 * const s3Key = generateS3Key(
 *   ['work-items', workItemId, 'attachments'],
 *   fileName
 * );
 * 
 * const { uploadUrl, expiresIn } = await generateUploadUrl(s3Key, {
 *   contentType: 'application/pdf',
 *   metadata: {
 *     resource_type: 'work_item_attachment',
 *     resource_id: workItemId,
 *     uploaded_by: userId,
 *   }
 * });
 * 
 * // Create DB record
 * await db.insert(work_item_attachments).values({
 *   work_item_attachment_id: attachmentId,
 *   s3_key: s3Key,
 *   s3_bucket: 'bcos-private-assets',
 *   uploaded_by: userId,
 * });
 * 
 * // Return uploadUrl to client
 * 
 * // Step 2: Client uploads directly to S3
 * await fetch(uploadUrl, {
 *   method: 'PUT',
 *   body: file,
 *   headers: { 'Content-Type': 'application/pdf' }
 * });
 * ```
 * 
 * ### Secure Download Flow
 * 
 * ```typescript
 * import { generateDownloadUrl } from '@/lib/s3/private-assets';
 * 
 * // Check permissions first
 * const canAccess = await checkPermission(userId, attachmentId);
 * if (!canAccess) throw new PermissionDeniedError();
 * 
 * // Get attachment from DB
 * const attachment = await getAttachment(attachmentId);
 * 
 * // Generate presigned download URL
 * const { downloadUrl, expiresAt } = await generateDownloadUrl(
 *   attachment.s3_key,
 *   {
 *     fileName: attachment.file_name,
 *     expiresIn: 900 // 15 minutes
 *   }
 * );
 * 
 * return { downloadUrl, expiresAt };
 * ```
 * 
 * ## Resource Type Examples
 * 
 * ### Work Item Attachments
 * 
 * ```typescript
 * const s3Key = generateS3Key(
 *   ['work-items', workItemId, 'attachments'],
 *   'document.pdf'
 * );
 * // => 'work-items/abc-123/attachments/document_k3j2h4g5.pdf'
 * ```
 * 
 * ### Invoices
 * 
 * ```typescript
 * const s3Key = generateS3Key(
 *   ['invoices', orgId, '2024', 'january'],
 *   'invoice.pdf'
 * );
 * // => 'invoices/org-456/2024/january/invoice_x2y3z4w5.pdf'
 * ```
 * 
 * ### Reports
 * 
 * ```typescript
 * const s3Key = generateS3Key(
 *   ['reports', orgId, 'analytics'],
 *   'monthly-report.xlsx',
 *   { addTimestamp: true }
 * );
 * // => 'reports/org-789/analytics/monthly-report_1704067200000_p9o8i7u6.xlsx'
 * ```
 * 
 * ### Practice Documents
 * 
 * ```typescript
 * const s3Key = generateS3Key(
 *   ['practices', practiceId, 'policies'],
 *   'hipaa-policy.pdf',
 *   { addUniqueId: false } // Static policy document
 * );
 * // => 'practices/practice-123/policies/hipaa-policy.pdf'
 * ```
 * 
 * ### User Documents
 * 
 * ```typescript
 * const s3Key = generateS3Key(
 *   ['users', userId, 'documents', 'licenses'],
 *   'medical-license.jpg'
 * );
 * // => 'users/user-456/documents/licenses/medical-license_m9n8b7v6.jpg'
 * ```
 * 
 * ### Backup Files
 * 
 * ```typescript
 * const s3Key = generateS3Key(
 *   ['backups', 'database', dateStr],
 *   'backup.sql.gz',
 *   { addTimestamp: true, addUniqueId: false }
 * );
 * // => 'backups/database/2024-01-15/backup_1704067200000.sql.gz'
 * ```
 * 
 * ## Configuration
 * 
 * Required environment variables:
 * 
 * ```bash
 * S3_PRIVATE_REGION=us-east-1
 * S3_PRIVATE_ACCESS_KEY_ID=AKIA...
 * S3_PRIVATE_SECRET_ACCESS_KEY=secret...
 * S3_PRIVATE_BUCKET=bcos-private-assets
 * 
 * # Optional: Custom expiration times (seconds)
 * S3_PRIVATE_UPLOAD_EXPIRATION=3600        # 1 hour (default)
 * S3_PRIVATE_DOWNLOAD_EXPIRATION=900       # 15 minutes (default)
 * ```
 * 
 * ## Security Features
 * 
 * - ✅ Separate IAM credentials for blast radius limitation
 * - ✅ Short-lived presigned URLs (15 min download, 1 hour upload)
 * - ✅ Server-side permission checks required before URL generation
 * - ✅ Path traversal prevention
 * - ✅ Filename sanitization
 * - ✅ Comprehensive audit logging
 * - ✅ Metadata tracking for compliance
 * 
 * @module s3/private-assets
 */

// Client and configuration
export { isS3Configured, getBucketName, getExpirationConfig } from './client';

// Presigned URLs
export { generateUploadUrl, generateDownloadUrl } from './presigned-urls';

// File operations
export { deleteFile, fileExists, getFileMetadata, copyFile } from './operations';

// Key generation
export { generateS3Key } from './key-generator';

// URL utilities
export { extractS3Key, isPresignedUrl, isExpired, getExpirationTime } from './url-utils';

// Image processing
export {
  isImage,
  getThumbnailKey,
  generateThumbnail,
  uploadWithThumbnail,
  generateThumbnailForExistingFile,
} from './image-processing';

// Constants
export {
  ALLOWED_MIME_TYPES,
  IMAGE_MIME_TYPES,
  FILE_SIZE_LIMITS,
  DEFAULT_MAX_FILE_SIZE,
  MAX_FILE_SIZE_LIMIT,
  THUMBNAIL_CONFIG,
} from './constants';

// Types
export type {
  GenerateKeyOptions,
  PresignedUploadOptions,
  PresignedDownloadOptions,
  PresignedUploadResult,
  PresignedDownloadResult,
  FileMetadata,
  DeleteOptions,
  CopyFileOptions,
} from './types';

