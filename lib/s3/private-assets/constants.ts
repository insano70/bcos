/**
 * Constants for S3 Private Assets Service
 * 
 * Centralized configuration for MIME types, file size limits, and other constraints.
 */

/**
 * Allowed MIME types for private file uploads
 * 
 * Security: Whitelist approach prevents executable uploads and file type spoofing
 * Maintainability: Add new types here as needed
 */
export const ALLOWED_MIME_TYPES = new Set([
  // Documents - PDF
  'application/pdf',

  // Documents - Microsoft Office (legacy)
  'application/msword', // .doc
  'application/vnd.ms-excel', // .xls
  'application/vnd.ms-powerpoint', // .ppt

  // Documents - Microsoft Office (modern)
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx

  // Images - Common formats
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',

  // Archives - Compression
  'application/zip',
  'application/x-zip-compressed',
  'application/x-gzip',
  'application/gzip',
  'application/x-tar',
  'application/x-compressed',
  'application/x-7z-compressed',

  // Text - Plain formats
  'text/plain',
  'text/csv',
  'text/markdown',
  'text/html',
  'text/css',
  'text/javascript',

  // Data - Structured formats
  'application/json',
  'application/xml',
  'text/xml',

  // Other - Common types
  'application/rtf',
  'application/vnd.oasis.opendocument.text', // .odt
  'application/vnd.oasis.opendocument.spreadsheet', // .ods
]) as ReadonlySet<string>;

/**
 * Default maximum file size for uploads (100MB)
 * This is a reasonable limit for most file types while preventing abuse
 */
export const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB in bytes

/**
 * Absolute maximum file size allowed (500MB)
 * Hard limit that cannot be exceeded even with custom maxFileSize
 */
export const MAX_FILE_SIZE_LIMIT = 500 * 1024 * 1024; // 500MB in bytes

/**
 * File size limits by category
 * Use these for type-specific validation
 */
export const FILE_SIZE_LIMITS = {
  image: 50 * 1024 * 1024, // 50MB for images
  document: 50 * 1024 * 1024, // 50MB for documents
  archive: 100 * 1024 * 1024, // 100MB for archives
  default: DEFAULT_MAX_FILE_SIZE,
} as const;

/**
 * Image MIME types (subset of ALLOWED_MIME_TYPES)
 * Used to determine if thumbnail generation should be applied
 */
export const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
]) as ReadonlySet<string>;

/**
 * Thumbnail generation configuration
 */
export const THUMBNAIL_CONFIG = {
  maxWidth: 300,
  maxHeight: 300,
  quality: 80, // JPEG quality (1-100)
  format: 'jpeg' as const, // Always convert to JPEG for consistency
  fit: 'inside' as const, // Maintain aspect ratio
} as const;

