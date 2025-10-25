/**
 * TypeScript types and interfaces for S3 public assets service
 */

// Re-export shared types used by both public and private asset systems
export type { GenerateKeyOptions } from '../shared/types';

/**
 * Options for uploading files to S3
 */
export interface UploadOptions {
  /**
   * MIME type of the file
   * @example 'image/jpeg', 'image/png', 'application/pdf'
   */
  contentType: string;

  /**
   * Cache-Control header for the uploaded file
   * @default 'public, max-age=31536000, immutable' (1 year)
   */
  cacheControl?: string;

  /**
   * Custom metadata to attach to the S3 object
   */
  metadata?: Record<string, string>;
}

/**
 * Result of a successful upload operation
 */
export interface UploadResult {
  /**
   * Full CloudFront URL to access the uploaded file
   * @example 'https://cdn.bendcare.com/practices/123/logo/logo_k3j2h4g5.jpg'
   */
  fileUrl: string;

  /**
   * S3 key (path within the bucket)
   * @example 'practices/123/logo/logo_k3j2h4g5.jpg'
   */
  s3Key: string;

  /**
   * Size of the uploaded file in bytes
   */
  size: number;

  /**
   * MIME type of the uploaded file
   */
  contentType: string;
}
