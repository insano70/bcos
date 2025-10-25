import { S3Client } from '@aws-sdk/client-s3';
import { log } from '@/lib/logger';

/**
 * S3 client for private assets
 * Uses dedicated credentials with S3_PRIVATE_* prefix for security isolation
 * 
 * Private assets require presigned URLs for upload/download to maintain access control.
 */
let s3ClientInstance: S3Client | null = null;

/**
 * Get environment configuration for S3 private assets
 */
function getConfig() {
  return {
    region: process.env.S3_PRIVATE_REGION || 'us-east-1',
    accessKeyId: process.env.S3_PRIVATE_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_PRIVATE_SECRET_ACCESS_KEY || '',
    bucket: process.env.S3_PRIVATE_BUCKET || '',
    uploadExpiration: Number(process.env.S3_PRIVATE_UPLOAD_EXPIRATION) || 3600, // 1 hour default
    downloadExpiration: Number(process.env.S3_PRIVATE_DOWNLOAD_EXPIRATION) || 900, // 15 minutes default
  };
}

/**
 * Check if S3 private assets are configured with all required credentials
 * 
 * @returns True if S3 is configured, false otherwise
 * 
 * @example
 * if (isS3Configured()) {
 *   // Generate presigned URLs
 * } else {
 *   // Handle gracefully - S3 not configured
 * }
 */
export function isS3Configured(): boolean {
  const config = getConfig();
  return !!(config.region && config.accessKeyId && config.secretAccessKey && config.bucket);
}

/**
 * Get or create S3 client instance (singleton pattern)
 * 
 * @returns S3Client instance
 * @throws Error if S3 is not configured
 * 
 * @example
 * const client = getS3Client();
 * const command = new PutObjectCommand({ ... });
 * await client.send(command);
 */
export function getS3Client(): S3Client {
  if (!isS3Configured()) {
    throw new Error(
      'S3 private assets not configured. Required environment variables: S3_PRIVATE_REGION, S3_PRIVATE_ACCESS_KEY_ID, S3_PRIVATE_SECRET_ACCESS_KEY, S3_PRIVATE_BUCKET'
    );
  }

  if (!s3ClientInstance) {
    const config = getConfig();
    s3ClientInstance = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

    log.info('S3 private assets client initialized', {
      region: config.region,
      bucket: config.bucket,
      uploadExpiration: config.uploadExpiration,
      downloadExpiration: config.downloadExpiration,
      component: 's3-private-assets',
    });
  }

  return s3ClientInstance;
}

/**
 * Get S3 bucket name from environment
 * 
 * @returns S3 bucket name
 * @throws Error if bucket not configured
 */
export function getBucketName(): string {
  const config = getConfig();
  if (!config.bucket) {
    throw new Error('S3_PRIVATE_BUCKET environment variable not configured');
  }
  return config.bucket;
}

/**
 * Get presigned URL expiration configuration
 * 
 * @returns Object with upload and download expiration times in seconds
 */
export function getExpirationConfig(): { uploadExpiration: number; downloadExpiration: number } {
  const config = getConfig();
  return {
    uploadExpiration: config.uploadExpiration,
    downloadExpiration: config.downloadExpiration,
  };
}

