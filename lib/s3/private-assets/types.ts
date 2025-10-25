/**
 * TypeScript types and interfaces for S3 private assets service
 * 
 * Private assets use presigned URLs for secure client-side uploads and downloads.
 * All files require authentication and authorization checks before URL generation.
 */

// Re-export shared types used by both public and private asset systems
export type { GenerateKeyOptions } from '../shared/types';

/**
 * Options for generating presigned upload URLs
 */
export interface PresignedUploadOptions {
  /**
   * MIME type of the file to upload
   * Must be in ALLOWED_MIME_TYPES whitelist for security
   * @example 'application/pdf', 'image/jpeg', 'text/csv'
   */
  contentType: string;

  /**
   * Expiration time in seconds for the presigned URL
   * @default 3600 (1 hour)
   * @min 60 seconds
   * @max 86400 seconds (24 hours)
   */
  expiresIn?: number;

  /**
   * Maximum file size in bytes
   * Enforces upload size limit to prevent storage abuse
   * @default 104857600 (100MB)
   * @min 1 byte
   * @max 524288000 (500MB)
   * 
   * @example
   * maxFileSize: 10 * 1024 * 1024  // 10MB for images
   * maxFileSize: 50 * 1024 * 1024  // 50MB for documents
   */
  maxFileSize?: number;

  /**
   * Custom metadata to attach to the S3 object
   * Useful for tracking resource type, uploader, organization, etc.
   * 
   * @example
   * {
   *   resource_type: 'work_item_attachment',
   *   resource_id: 'abc-123',
   *   uploaded_by: 'user-456',
   *   organization_id: 'org-789'
   * }
   */
  metadata?: Record<string, string>;

  /**
   * Cache-Control header for the uploaded file
   * @default 'private, no-cache' (no caching for private files)
   */
  cacheControl?: string;
}

/**
 * Result of presigned upload URL generation
 */
export interface PresignedUploadResult {
  /**
   * Presigned URL for client to upload file to S3
   * Client should use PUT request with this URL
   * 
   * @example
   * await fetch(uploadUrl, {
   *   method: 'PUT',
   *   body: file,
   *   headers: { 'Content-Type': contentType }
   * });
   */
  uploadUrl: string;

  /**
   * S3 key where the file will be stored
   * Store this in database for later retrieval
   */
  s3Key: string;

  /**
   * Expiration time in seconds
   */
  expiresIn: number;

  /**
   * S3 bucket name
   */
  bucket: string;
}

/**
 * Options for generating presigned download URLs
 */
export interface PresignedDownloadOptions {
  /**
   * Original filename for Content-Disposition header
   * Sets the filename when user downloads the file
   * 
   * @example 'document.pdf' - User's browser will suggest this filename
   */
  fileName?: string;

  /**
   * Expiration time in seconds for the presigned URL
   * @default 900 (15 minutes)
   * @min 60 seconds
   * @max 3600 seconds (1 hour)
   */
  expiresIn?: number;

  /**
   * Content-Disposition type
   * @default 'attachment' (forces download)
   * @alternative 'inline' (opens in browser if supported)
   */
  disposition?: 'attachment' | 'inline';
}

/**
 * Result of presigned download URL generation
 */
export interface PresignedDownloadResult {
  /**
   * Presigned URL for client to download file from S3
   * Client should use GET request with this URL
   * 
   * @example
   * window.location.href = downloadUrl; // Triggers download
   */
  downloadUrl: string;

  /**
   * Expiration time in seconds
   */
  expiresIn: number;

  /**
   * Timestamp when URL expires (Unix timestamp in milliseconds)
   */
  expiresAt: number;
}

/**
 * File metadata from S3
 */
export interface FileMetadata {
  /**
   * S3 key of the file
   */
  s3Key: string;

  /**
   * File size in bytes
   */
  size: number;

  /**
   * MIME type of the file
   */
  contentType: string;

  /**
   * Last modified timestamp
   */
  lastModified: Date;

  /**
   * ETag (entity tag) for cache validation
   */
  etag: string;

  /**
   * Custom metadata attached to the S3 object
   */
  metadata: Record<string, string>;
}

/**
 * Options for deleting files
 */
export interface DeleteOptions {
  /**
   * Whether to verify file exists before deletion
   * @default false
   */
  verifyExists?: boolean;

  /**
   * Whether to ignore NotFound errors
   * @default true (no error if file doesn't exist)
   */
  ignoreNotFound?: boolean;
}

/**
 * Options for copying files
 */
export interface CopyFileOptions {
  /**
   * Source S3 key
   */
  sourceKey: string;

  /**
   * Destination S3 key
   */
  destinationKey: string;

  /**
   * Optional metadata for the copied file
   * If not provided, metadata from source is preserved
   */
  metadata?: Record<string, string>;

  /**
   * Whether to replace metadata or merge with source
   * @default 'replace'
   */
  metadataDirective?: 'copy' | 'replace';
}

