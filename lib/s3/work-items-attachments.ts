import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { log } from '@/lib/logger';

/**
 * Initialize S3 client with credentials from environment
 */
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

/**
 * S3 bucket for work item attachments
 */
const BUCKET_NAME = process.env.S3_WORK_ITEMS_BUCKET || 'bcos-work-items';

/**
 * Presigned URL expiration time (1 hour)
 */
const URL_EXPIRATION_SECONDS = 3600;

/**
 * Generate S3 key for work item attachment
 * Pattern: work-items/{work_item_id}/attachments/{attachment_id}/{filename}
 *
 * @param workItemId - UUID of the work item
 * @param attachmentId - UUID of the attachment record
 * @param fileName - Original filename
 * @returns S3 object key
 */
export function generateS3Key(
  workItemId: string,
  attachmentId: string,
  fileName: string
): string {
  // Sanitize filename to prevent path traversal
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `work-items/${workItemId}/attachments/${attachmentId}/${sanitizedFileName}`;
}

/**
 * Generate presigned URL for uploading a file to S3
 * Client will use this URL to upload directly to S3
 *
 * @param workItemId - UUID of the work item
 * @param attachmentId - UUID of the attachment record
 * @param fileName - Original filename
 * @param fileType - MIME type
 * @returns Upload URL and S3 key
 */
export async function generateUploadUrl(
  workItemId: string,
  attachmentId: string,
  fileName: string,
  fileType: string
): Promise<{ uploadUrl: string; s3Key: string; bucket: string }> {
  const startTime = Date.now();
  const s3Key = generateS3Key(workItemId, attachmentId, fileName);

  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      ContentType: fileType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: URL_EXPIRATION_SECONDS,
    });

    log.info('Generated upload URL', {
      s3Key,
      bucket: BUCKET_NAME,
      fileType,
      expiresIn: URL_EXPIRATION_SECONDS,
      duration: Date.now() - startTime,
    });

    return {
      uploadUrl,
      s3Key,
      bucket: BUCKET_NAME,
    };
  } catch (error) {
    log.error('Failed to generate upload URL', error, {
      s3Key,
      bucket: BUCKET_NAME,
      fileType,
      duration: Date.now() - startTime,
    });
    throw new Error('Failed to generate upload URL');
  }
}

/**
 * Generate presigned URL for downloading a file from S3
 * Client will use this URL to download directly from S3
 *
 * @param s3Key - S3 object key
 * @param fileName - Optional filename for Content-Disposition header
 * @returns Download URL
 */
export async function generateDownloadUrl(
  s3Key: string,
  fileName?: string
): Promise<string> {
  const startTime = Date.now();

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      ...(fileName && {
        ResponseContentDisposition: `attachment; filename="${fileName}"`,
      }),
    });

    const downloadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: URL_EXPIRATION_SECONDS,
    });

    log.info('Generated download URL', {
      s3Key,
      bucket: BUCKET_NAME,
      expiresIn: URL_EXPIRATION_SECONDS,
      duration: Date.now() - startTime,
    });

    return downloadUrl;
  } catch (error) {
    log.error('Failed to generate download URL', error, {
      s3Key,
      bucket: BUCKET_NAME,
      duration: Date.now() - startTime,
    });
    throw new Error('Failed to generate download URL');
  }
}

/**
 * Delete a file from S3
 * Called when an attachment is deleted
 *
 * @param s3Key - S3 object key
 */
export async function deleteFile(s3Key: string): Promise<void> {
  const startTime = Date.now();

  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
    });

    await s3Client.send(command);

    log.info('Deleted file from S3', {
      s3Key,
      bucket: BUCKET_NAME,
      duration: Date.now() - startTime,
    });
  } catch (error) {
    log.error('Failed to delete file from S3', error, {
      s3Key,
      bucket: BUCKET_NAME,
      duration: Date.now() - startTime,
    });
    throw new Error('Failed to delete file from S3');
  }
}

/**
 * Check if a file exists in S3
 * Useful for verifying upload completion
 *
 * @param s3Key - S3 object key
 * @returns True if file exists, false otherwise
 */
export async function fileExists(s3Key: string): Promise<boolean> {
  const startTime = Date.now();

  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
    });

    await s3Client.send(command);

    log.info('File exists in S3', {
      s3Key,
      bucket: BUCKET_NAME,
      duration: Date.now() - startTime,
    });

    return true;
  } catch (error) {
    const err = error as { name?: string };
    if (err.name === 'NotFound') {
      log.info('File not found in S3', {
        s3Key,
        bucket: BUCKET_NAME,
        duration: Date.now() - startTime,
      });
      return false;
    }

    log.error('Failed to check file existence in S3', error, {
      s3Key,
      bucket: BUCKET_NAME,
      duration: Date.now() - startTime,
    });
    throw new Error('Failed to check file existence');
  }
}

/**
 * Get S3 bucket name
 * Utility function for services that need the bucket name
 *
 * @returns S3 bucket name
 */
export function getBucketName(): string {
  return BUCKET_NAME;
}
