import { S3Client } from '@aws-sdk/client-s3';
import { log } from '@/lib/logger';

/**
 * S3 client for public assets
 * Uses dedicated credentials with S3_PUBLIC_* prefix to avoid collisions
 */
let s3ClientInstance: S3Client | null = null;

/**
 * Get environment configuration for S3 public assets
 */
function getConfig() {
  return {
    region: process.env.S3_PUBLIC_REGION || 'us-east-1',
    accessKeyId: process.env.S3_PUBLIC_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_PUBLIC_SECRET_ACCESS_KEY || '',
    bucket: process.env.S3_PUBLIC_BUCKET || '',
    cdnUrl: process.env.CDN_URL || '',
  };
}

/**
 * Check if S3 is configured with all required credentials
 * @returns True if S3 is configured, false otherwise
 */
export function isS3Configured(): boolean {
  const config = getConfig();
  return !!(
    config.region &&
    config.accessKeyId &&
    config.secretAccessKey &&
    config.bucket &&
    config.cdnUrl
  );
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
    const config = getConfig();
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
  const config = getConfig();
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
  const config = getConfig();
  if (!config.cdnUrl) {
    throw new Error('CDN_URL environment variable not configured');
  }
  return config.cdnUrl;
}
