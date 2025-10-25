import { CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { log } from '@/lib/logger';
import { getBucketName, getS3Client, isS3Configured } from './client';
import type { CopyFileOptions, DeleteOptions, FileMetadata } from './types';

/**
 * Delete a file from S3
 * 
 * Performs hard delete from S3. Soft deletes should be handled at the database level.
 * S3 DeleteObject is idempotent - no error if file doesn't exist.
 * 
 * @param s3Key - S3 key of file to delete
 * @param options - Delete options
 * @throws Error if S3 is not configured or delete fails
 * 
 * @example
 * // Delete work item attachment
 * await deleteFile('work-items/abc-123/attachments/document_xyz.pdf');
 * 
 * @example
 * // Delete with verification
 * await deleteFile('invoices/org-456/invoice.pdf', {
 *   verifyExists: true // Will check if file exists before deleting
 * });
 */
export async function deleteFile(s3Key: string, options: DeleteOptions = {}): Promise<void> {
  const startTime = Date.now();

  if (!isS3Configured()) {
    throw new Error(
      'S3 private assets not configured. Cannot delete file. Required: S3_PRIVATE_REGION, S3_PRIVATE_ACCESS_KEY_ID, S3_PRIVATE_SECRET_ACCESS_KEY, S3_PRIVATE_BUCKET'
    );
  }

  const { verifyExists = false, ignoreNotFound = true } = options;
  const client = getS3Client();
  const bucket = getBucketName();

  try {
    // Optionally verify file exists before deletion
    if (verifyExists) {
      const exists = await fileExists(s3Key);
      if (!exists) {
        if (ignoreNotFound) {
          log.info('File not found for deletion (ignored)', {
            operation: 'delete_file',
            s3Key,
            bucket,
            duration: Date.now() - startTime,
            component: 's3-private-assets',
          });
          return;
        }
        throw new Error(`File not found: ${s3Key}`);
      }
    }

    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    });

    await client.send(command);

    const duration = Date.now() - startTime;

    log.info('Deleted file from S3', {
      operation: 'delete_file',
      s3Key,
      bucket,
      duration,
      component: 's3-private-assets',
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Failed to delete file from S3', error, {
      operation: 'delete_file',
      s3Key,
      bucket,
      duration,
      component: 's3-private-assets',
    });
    throw new Error('Failed to delete file from S3');
  }
}

/**
 * Check if a file exists in S3
 * 
 * Uses HEAD request which is lightweight and doesn't transfer file data.
 * Useful for verifying upload completion or checking file existence before operations.
 * 
 * @param s3Key - S3 key to check
 * @returns True if file exists, false if not found
 * @throws Error if S3 is not configured or check fails (other than NotFound)
 * 
 * @example
 * // Check if attachment exists
 * const exists = await fileExists('work-items/abc-123/attachments/doc.pdf');
 * if (exists) {
 *   console.log('File is ready for download');
 * }
 * 
 * @example
 * // Verify upload completed
 * await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
 * const uploaded = await fileExists(s3Key);
 * if (!uploaded) {
 *   throw new Error('Upload verification failed');
 * }
 */
export async function fileExists(s3Key: string): Promise<boolean> {
  const startTime = Date.now();

  if (!isS3Configured()) {
    throw new Error(
      'S3 private assets not configured. Cannot check file existence. Required: S3_PRIVATE_REGION, S3_PRIVATE_ACCESS_KEY_ID, S3_PRIVATE_SECRET_ACCESS_KEY, S3_PRIVATE_BUCKET'
    );
  }

  const client = getS3Client();
  const bucket = getBucketName();

  try {
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    });

    await client.send(command);

    const duration = Date.now() - startTime;

    log.info('File exists in S3', {
      operation: 'file_exists',
      s3Key,
      bucket,
      exists: true,
      duration,
      component: 's3-private-assets',
    });

    return true;
  } catch (error) {
    const duration = Date.now() - startTime;
    const err = error as { name?: string };

    if (err.name === 'NotFound') {
      log.info('File not found in S3', {
        operation: 'file_exists',
        s3Key,
        bucket,
        exists: false,
        duration,
        component: 's3-private-assets',
      });
      return false;
    }

    log.error('Failed to check file existence in S3', error, {
      operation: 'file_exists',
      s3Key,
      bucket,
      duration,
      component: 's3-private-assets',
    });
    throw new Error('Failed to check file existence in S3');
  }
}

/**
 * Get file metadata from S3
 * 
 * Returns file size, content type, last modified date, and custom metadata.
 * Useful for displaying file information without downloading the file.
 * 
 * @param s3Key - S3 key of file
 * @returns File metadata including size, content type, etag, and custom metadata
 * @throws Error if S3 is not configured, file not found, or metadata retrieval fails
 * 
 * @example
 * // Get attachment metadata
 * const metadata = await getFileMetadata('work-items/abc-123/attachments/doc.pdf');
 * console.log(`File size: ${metadata.size} bytes`);
 * console.log(`Content type: ${metadata.contentType}`);
 * console.log(`Uploaded by: ${metadata.metadata.uploaded_by}`);
 * 
 * @example
 * // Check file size before download
 * const { size } = await getFileMetadata(s3Key);
 * if (size > 100 * 1024 * 1024) { // 100MB
 *   throw new Error('File too large');
 * }
 */
export async function getFileMetadata(s3Key: string): Promise<FileMetadata> {
  const startTime = Date.now();

  if (!isS3Configured()) {
    throw new Error(
      'S3 private assets not configured. Cannot get file metadata. Required: S3_PRIVATE_REGION, S3_PRIVATE_ACCESS_KEY_ID, S3_PRIVATE_SECRET_ACCESS_KEY, S3_PRIVATE_BUCKET'
    );
  }

  const client = getS3Client();
  const bucket = getBucketName();

  try {
    const command = new HeadObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    });

    const response = await client.send(command);

    const duration = Date.now() - startTime;

    log.info('Retrieved file metadata from S3', {
      operation: 'get_file_metadata',
      s3Key,
      bucket,
      size: response.ContentLength,
      contentType: response.ContentType,
      duration,
      component: 's3-private-assets',
    });

    return {
      s3Key,
      size: response.ContentLength || 0,
      contentType: response.ContentType || 'application/octet-stream',
      lastModified: response.LastModified || new Date(),
      etag: response.ETag || '',
      metadata: response.Metadata || {},
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const err = error as { name?: string };

    if (err.name === 'NotFound') {
      log.error('File not found when retrieving metadata', error, {
        operation: 'get_file_metadata',
        s3Key,
        bucket,
        duration,
        component: 's3-private-assets',
      });
      throw new Error(`File not found: ${s3Key}`);
    }

    log.error('Failed to get file metadata from S3', error, {
      operation: 'get_file_metadata',
      s3Key,
      bucket,
      duration,
      component: 's3-private-assets',
    });
    throw new Error('Failed to get file metadata from S3');
  }
}

/**
 * Copy a file within S3 bucket
 * 
 * Useful for creating file versions, archives, or moving files between paths.
 * Copy operation is server-side within S3 - no data transfer to application.
 * 
 * @param options - Copy options including source and destination keys
 * @throws Error if S3 is not configured or copy fails
 * 
 * @example
 * // Archive work item attachment
 * await copyFile({
 *   sourceKey: 'work-items/abc-123/attachments/doc.pdf',
 *   destinationKey: 'work-items/abc-123/archive/doc-2024-01-15.pdf',
 *   metadata: {
 *     archived_at: new Date().toISOString(),
 *     archived_by: 'user-456'
 *   }
 * });
 * 
 * @example
 * // Create file version
 * await copyFile({
 *   sourceKey: 'invoices/org-456/invoice-current.pdf',
 *   destinationKey: 'invoices/org-456/versions/invoice-v2.pdf',
 *   metadataDirective: 'copy' // Preserve original metadata
 * });
 */
export async function copyFile(options: CopyFileOptions): Promise<void> {
  const startTime = Date.now();

  if (!isS3Configured()) {
    throw new Error(
      'S3 private assets not configured. Cannot copy file. Required: S3_PRIVATE_REGION, S3_PRIVATE_ACCESS_KEY_ID, S3_PRIVATE_SECRET_ACCESS_KEY, S3_PRIVATE_BUCKET'
    );
  }

  const { sourceKey, destinationKey, metadata, metadataDirective = 'replace' } = options;
  const client = getS3Client();
  const bucket = getBucketName();

  try {
    const command = new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `${bucket}/${sourceKey}`,
      Key: destinationKey,
      Metadata: metadata,
      MetadataDirective: metadataDirective === 'copy' ? 'COPY' : 'REPLACE',
    });

    await client.send(command);

    const duration = Date.now() - startTime;

    log.info('Copied file in S3', {
      operation: 'copy_file',
      sourceKey,
      destinationKey,
      bucket,
      metadataDirective,
      duration,
      component: 's3-private-assets',
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Failed to copy file in S3', error, {
      operation: 'copy_file',
      sourceKey,
      destinationKey,
      bucket,
      duration,
      component: 's3-private-assets',
    });
    throw new Error('Failed to copy file in S3');
  }
}

