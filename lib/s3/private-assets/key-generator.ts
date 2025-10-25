import { nanoid } from 'nanoid';
import type { GenerateKeyOptions } from './types';
import { preventPathTraversal, sanitizeFileName, sanitizePathSegment } from '../shared/sanitization';

/**
 * Generate S3 key for a private file with flexible path composition
 * 
 * This function creates S3 keys by composing path segments and filename,
 * with optional unique ID and timestamp for cache-busting and collision prevention.
 * 
 * Identical API to public assets for consistency across all S3 operations.
 * 
 * @param pathSegments - Array of path segments (e.g., ['work-items', '123', 'attachments'])
 * @param fileName - Original filename (e.g., 'document.pdf')
 * @param options - Key generation options
 * @returns S3 key string (e.g., 'work-items/123/attachments/document_k3j2h4g5.pdf')
 * 
 * @example
 * // Work item attachment
 * generateS3Key(['work-items', workItemId, 'attachments'], 'document.pdf')
 * // => 'work-items/abc-123/attachments/document_k3j2h4g5.pdf'
 * 
 * @example
 * // Invoice
 * generateS3Key(['invoices', orgId, '2024'], 'invoice-january.pdf')
 * // => 'invoices/org-456/2024/invoice-january_x2y3z4w5.pdf'
 * 
 * @example
 * // Report with timestamp
 * generateS3Key(['reports', orgId, 'analytics'], 'report.xlsx', { addTimestamp: true })
 * // => 'reports/org-789/analytics/report_1704067200000_p9o8i7u6.xlsx'
 * 
 * @example
 * // Practice policy document (no unique ID needed)
 * generateS3Key(['practices', practiceId, 'policies'], 'hipaa.pdf', { addUniqueId: false })
 * // => 'practices/practice-123/policies/hipaa.pdf'
 * 
 * @example
 * // User document with preserved casing
 * generateS3Key(['users', userId, 'documents'], 'IMPORTANT_DOC.pdf', { preserveName: true })
 * // => 'users/user-456/documents/IMPORTANT_DOC_k3j2h4g5.pdf'
 * 
 * @example
 * // Nested resource structure
 * generateS3Key(
 *   ['work-items', parentId, 'children', childId, 'attachments'],
 *   'screenshot.jpg'
 * )
 * // => 'work-items/parent-123/children/child-456/attachments/screenshot_a8s9d7f6.jpg'
 * 
 * @example
 * // Archive with timestamp for versioning
 * generateS3Key(
 *   ['work-items', workItemId, 'archive'],
 *   'old-document.pdf',
 *   { addTimestamp: true, addUniqueId: false }
 * )
 * // => 'work-items/abc-123/archive/old-document_1704067200000.pdf'
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

  // Prevent path traversal attacks
  preventPathTraversal(sanitizedPath);

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
  const fullPath = sanitizedPath ? `${sanitizedPath}/${finalFileName}` : finalFileName;

  // Final path traversal check
  preventPathTraversal(fullPath);

  return fullPath;
}

