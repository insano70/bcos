import { S3Client } from '@aws-sdk/client-s3';
import { getPublicS3Config, isPublicS3Enabled } from '@/lib/env';
import { log } from '@/lib/logger';

/**
 * S3 client for public assets
 * Uses dedicated credentials with S3_PUBLIC_* prefix to avoid collisions
 * Configuration is validated via lib/env.ts using Zod schemas.
 */
let s3ClientInstance: S3Client | null = null;

/**
 * Check if S3 is configured with all required credentials
 * @returns True if S3 is configured, false otherwise
 */
export function isS3Configured(): boolean {
  return isPublicS3Enabled();
}

/**
 * Get or create S3 client instance (singleton pattern)
 * @returns S3Client instance
 * @throws Error if S3 is not configured
 */
export function getS3Client(): S3Client {
  if (!isS3Configured()) {
    throw new Error(
      'S3 public assets not configured. Required environment variables: S3_PUBLIC_REGION, S3_PUBLIC_ACCESS_KEY_ID, S3_PUBLIC_SECRET_ACCESS_KEY, S3_PUBLIC_BUCKET, CDN_URL'
    );
  }

  if (!s3ClientInstance) {
    const config = getPublicS3Config();
    s3ClientInstance = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

    log.info('S3 public assets client initialized', {
      region: config.region,
      bucket: config.bucket,
      cdnUrl: config.cdnUrl,
    });
  }

  return s3ClientInstance;
}

/**
 * Get S3 bucket name from environment
 * @returns S3 bucket name
 */
export function getBucketName(): string {
  const config = getPublicS3Config();
  if (!config.bucket) {
    throw new Error('S3_PUBLIC_BUCKET environment variable not configured');
  }
  return config.bucket;
}

/**
 * Get CDN URL from environment
 * @returns CDN URL (e.g., 'https://cdn.bendcare.com')
 */
export function getCdnUrl(): string {
  const config = getPublicS3Config();
  if (!config.cdnUrl) {
    throw new Error('CDN_URL environment variable not configured');
  }
  return config.cdnUrl;
}
