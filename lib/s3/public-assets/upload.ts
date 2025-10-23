import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { log } from '@/lib/logger';
import { getBucketName, getCdnUrl, getS3Client, isS3Configured } from './client';
import type { UploadOptions, UploadResult } from './types';

/**
 * Upload a file buffer to S3
 *
 * @param buffer - File buffer to upload
 * @param s3Key - S3 key (path within bucket)
 * @param options - Upload options including contentType
 * @returns Upload result with CloudFront URL
 * @throws Error if S3 is not configured or upload fails
 *
 * @example
 * const buffer = await file.arrayBuffer().then(ab => Buffer.from(ab));
 * const result = await uploadToS3(buffer, 'practices/123/logo/logo_xyz.jpg', {
 *   contentType: 'image/jpeg',
 * });
 * console.log(result.fileUrl); // 'https://cdn.bendcare.com/practices/123/logo/logo_xyz.jpg'
 */
export async function uploadToS3(
  buffer: Buffer,
  s3Key: string,
  options: UploadOptions
): Promise<UploadResult> {
  const startTime = Date.now();

  if (!isS3Configured()) {
    throw new Error(
      'S3 public assets not configured. Cannot upload. Required: S3_PUBLIC_REGION, S3_PUBLIC_ACCESS_KEY_ID, S3_PUBLIC_SECRET_ACCESS_KEY, S3_PUBLIC_BUCKET, CDN_URL'
    );
  }

  const client = getS3Client();
  const bucket = getBucketName();
  const cdnUrl = getCdnUrl();

  const {
    contentType,
    cacheControl = 'public, max-age=31536000, immutable', // 1 year cache
    metadata = {},
  } = options;

  try {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: cacheControl,
      Metadata: metadata,
    });

    await client.send(command);

    const duration = Date.now() - startTime;
    const fileUrl = `${cdnUrl}/${s3Key}`;

    log.info('File uploaded to S3', {
      s3Key,
      bucket,
      size: buffer.length,
      contentType,
      fileUrl,
      duration,
      component: 's3-public-assets',
    });

    return {
      fileUrl,
      s3Key,
      size: buffer.length,
      contentType,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Failed to upload file to S3', error, {
      s3Key,
      bucket,
      size: buffer.length,
      contentType,
      duration,
      component: 's3-public-assets',
    });
    throw new Error('Failed to upload file to S3');
  }
}

/**
 * Delete a file from S3
 *
 * @param s3Key - S3 key (path within bucket) of file to delete
 * @throws Error if S3 is not configured or delete fails
 *
 * @example
 * await deleteFromS3('practices/123/logo/old-logo_abc.jpg');
 */
export async function deleteFromS3(s3Key: string): Promise<void> {
  const startTime = Date.now();

  if (!isS3Configured()) {
    throw new Error('S3 public assets not configured. Cannot delete.');
  }

  const client = getS3Client();
  const bucket = getBucketName();

  try {
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: s3Key,
    });

    await client.send(command);

    const duration = Date.now() - startTime;

    log.info('File deleted from S3', {
      s3Key,
      bucket,
      duration,
      component: 's3-public-assets',
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Failed to delete file from S3', error, {
      s3Key,
      bucket,
      duration,
      component: 's3-public-assets',
    });
    throw new Error('Failed to delete file from S3');
  }
}

/**
 * Check if a file exists in S3
 *
 * @param s3Key - S3 key (path within bucket) to check
 * @returns True if file exists, false if not found
 * @throws Error if S3 is not configured or check fails (other than NotFound)
 *
 * @example
 * const exists = await fileExistsInS3('practices/123/logo/logo_xyz.jpg');
 * if (exists) {
 *   console.log('File already exists');
 * }
 */
export async function fileExistsInS3(s3Key: string): Promise<boolean> {
  const startTime = Date.now();

  if (!isS3Configured()) {
    throw new Error('S3 public assets not configured. Cannot check file existence.');
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
      s3Key,
      bucket,
      exists: true,
      duration,
      component: 's3-public-assets',
    });

    return true;
  } catch (error) {
    const duration = Date.now() - startTime;
    const err = error as { name?: string };

    if (err.name === 'NotFound') {
      log.info('File not found in S3', {
        s3Key,
        bucket,
        exists: false,
        duration,
        component: 's3-public-assets',
      });
      return false;
    }

    log.error('Failed to check file existence in S3', error, {
      s3Key,
      bucket,
      duration,
      component: 's3-public-assets',
    });
    throw new Error('Failed to check file existence in S3');
  }
}
