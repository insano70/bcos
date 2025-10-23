import { nanoid } from 'nanoid';
import type { GenerateKeyOptions } from './types';

/**
 * Sanitize a path segment to be safe for S3 keys
 * Removes invalid characters and prevents path traversal
 *
 * @param segment - Path segment to sanitize
 * @returns Sanitized segment
 */
function sanitizePathSegment(segment: string): string {
  return segment
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-') // Replace invalid chars with hyphen
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Sanitize a filename to be safe for S3 keys
 * Preserves extension, converts to lowercase
 *
 * @param fileName - Filename to sanitize
 * @param preserveName - If true, preserve original name with minimal sanitization
 * @returns Sanitized filename
 */
function sanitizeFileName(fileName: string, preserveName = false): string {
  // Extract extension
  const parts = fileName.split('.');
  const ext = parts.length > 1 ? parts.pop() : '';
  const name = parts.join('.');

  if (preserveName) {
    // Minimal sanitization - only remove dangerous characters
    const safeName = name.replace(/[^a-zA-Z0-9._-]/g, '_');
    return ext ? `${safeName}.${ext.toLowerCase()}` : safeName;
  }

  // Full sanitization - lowercase, replace special chars
  const safeName = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  return ext ? `${safeName}.${ext.toLowerCase()}` : safeName;
}

/**
 * Generate S3 key for a file with flexible path composition
 *
 * This function creates S3 keys by composing path segments and filename,
 * with optional unique ID and timestamp for cache-busting and collision prevention.
 *
 * @param pathSegments - Array of path segments (e.g., ['practices', '123', 'logo'])
 * @param fileName - Original filename (e.g., 'logo.jpg')
 * @param options - Key generation options
 * @returns S3 key string (e.g., 'practices/123/logo/logo_k3j2h4g5.jpg')
 *
 * @example
 * // Practice logo
 * generateS3Key(['practices', '123', 'logo'], 'company-logo.jpg')
 * // => 'practices/123/logo/company-logo_k3j2h4g5.jpg'
 *
 * @example
 * // Practice hero image
 * generateS3Key(['practices', '456', 'hero'], 'hero-image.jpg')
 * // => 'practices/456/hero/hero-image_a8s9d7f6.jpg'
 *
 * @example
 * // Practice gallery image
 * generateS3Key(['practices', '789', 'gallery'], 'photo-1.jpg')
 * // => 'practices/789/gallery/photo-1_x2y3z4w5.jpg'
 *
 * @example
 * // Staff photo
 * generateS3Key(['practices', '123', 'staff', '456'], 'headshot.jpg')
 * // => 'practices/123/staff/456/headshot_m9n8b7v6.jpg'
 *
 * @example
 * // User avatar
 * generateS3Key(['users', 'user-uuid', 'avatar'], 'profile.png')
 * // => 'users/user-uuid/avatar/profile_c5d4e3f2.png'
 *
 * @example
 * // Organization logo
 * generateS3Key(['organizations', 'org-uuid', 'logo'], 'brand.svg')
 * // => 'organizations/org-uuid/logo/brand_q1w2e3r4.svg'
 *
 * @example
 * // Marketing campaign asset
 * generateS3Key(['marketing', 'campaigns', 'summer-2024'], 'banner.jpg')
 * // => 'marketing/campaigns/summer-2024/banner_t5y6u7i8.jpg'
 *
 * @example
 * // Static asset without unique ID
 * generateS3Key(['static', 'icons'], 'favicon.ico', { addUniqueId: false })
 * // => 'static/icons/favicon.ico'
 *
 * @example
 * // With timestamp for versioning
 * generateS3Key(['docs', 'reports'], 'annual-report.pdf', { addTimestamp: true })
 * // => 'docs/reports/annual-report_1704067200000_p9o8i7u6.pdf'
 *
 * @example
 * // Preserve original filename casing
 * generateS3Key(['uploads', 'legal'], 'IMPORTANT_DOC.pdf', { preserveName: true })
 * // => 'uploads/legal/IMPORTANT_DOC_k3j2h4g5.pdf'
 */
export function generateS3Key(
  pathSegments: string[],
  fileName: string,
  options: GenerateKeyOptions = {}
): string {
  const {
    addUniqueId = true,
    preserveName = false,
    addTimestamp = false,
    uniqueIdLength = 10,
  } = options;

  // Sanitize path segments
  const sanitizedPath = pathSegments.map(sanitizePathSegment).filter(Boolean).join('/');

  // Sanitize filename
  const sanitizedFileName = sanitizeFileName(fileName, preserveName);

  // Split filename into name and extension
  const parts = sanitizedFileName.split('.');
  const ext = parts.length > 1 ? parts.pop() : '';
  const name = parts.join('.');

  // Build filename with optional timestamp and unique ID
  let finalName = name;

  if (addTimestamp) {
    finalName += `_${Date.now()}`;
  }

  if (addUniqueId) {
    finalName += `_${nanoid(uniqueIdLength)}`;
  }

  const finalFileName = ext ? `${finalName}.${ext}` : finalName;

  // Combine path and filename
  return sanitizedPath ? `${sanitizedPath}/${finalFileName}` : finalFileName;
}
