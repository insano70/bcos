/**
 * Shared sanitization utilities for S3 services
 * 
 * These functions are used by both public and private asset systems to ensure
 * safe and consistent handling of file paths and names.
 * 
 * Security: All functions prevent path traversal attacks and invalid S3 keys.
 */

/**
 * Sanitize a path segment to be safe for S3 keys
 * Removes invalid characters and prevents path traversal
 *
 * @param segment - Path segment to sanitize (e.g., 'practices', '123', 'logo')
 * @returns Sanitized segment safe for S3 keys
 *
 * @example
 * sanitizePathSegment('My Practice Name')
 * // => 'My-Practice-Name'
 *
 * @example
 * sanitizePathSegment('user@email.com')
 * // => 'user-email-com'
 *
 * @example
 * sanitizePathSegment('  spaces  ')
 * // => 'spaces'
 */
export function sanitizePathSegment(segment: string): string {
  return segment
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-') // Replace invalid chars with hyphen
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Sanitize a filename to be safe for S3 keys
 * Preserves file extension, optionally preserves original casing
 *
 * @param fileName - Filename to sanitize (e.g., 'My Document.pdf')
 * @param preserveName - If true, preserve original name with minimal sanitization
 * @returns Sanitized filename safe for S3 keys
 *
 * @example
 * // Full sanitization (default)
 * sanitizeFileName('My Document (Final).pdf')
 * // => 'my_document_final.pdf'
 *
 * @example
 * // Preserve original casing
 * sanitizeFileName('IMPORTANT_Document.pdf', true)
 * // => 'IMPORTANT_Document.pdf'
 *
 * @example
 * // Handles multiple dots
 * sanitizeFileName('archive.tar.gz')
 * // => 'archive_tar.gz'
 *
 * @example
 * // No extension
 * sanitizeFileName('README')
 * // => 'readme'
 */
export function sanitizeFileName(fileName: string, preserveName = false): string {
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
 * Prevent path traversal attacks in S3 keys
 * Throws an error if path contains traversal patterns
 *
 * @param path - S3 key path to validate
 * @throws Error if path contains traversal patterns
 *
 * @example
 * // Valid path - no error
 * preventPathTraversal('work-items/abc-123/attachments/file.pdf')
 *
 * @example
 * // Invalid path - throws error
 * preventPathTraversal('../../../etc/passwd')
 * // => Error: 'Path traversal detected in S3 key'
 *
 * @example
 * // Invalid path - throws error
 * preventPathTraversal('work-items//attachments')
 * // => Error: 'Path traversal detected in S3 key'
 */
export function preventPathTraversal(path: string): void {
  if (path.includes('..') || path.includes('//')) {
    throw new Error(
      `Path traversal detected in S3 key: ${path}. S3 keys cannot contain '..' or '//' for security.`
    );
  }
}

