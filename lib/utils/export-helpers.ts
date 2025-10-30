/**
 * Export Helper Utilities
 *
 * Shared utilities for CSV and Excel exports
 */

/**
 * Detect data type from value
 */
export function detectDataType(value: unknown): 'string' | 'number' | 'date' | 'boolean' | 'null' {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'boolean') {
    return 'boolean';
  }

  if (typeof value === 'number') {
    return 'number';
  }

  if (value instanceof Date) {
    return 'date';
  }

  // Check if string looks like a date
  if (typeof value === 'string') {
    const datePattern = /^\d{4}-\d{2}-\d{2}(T|\s)/;
    if (datePattern.test(value)) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return 'date';
      }
    }
  }

  return 'string';
}

/**
 * Generate export filename with timestamp
 */
export function generateExportFilename(
  baseName: string,
  extension: 'csv' | 'xlsx'
): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19);

  return `${baseName}-${timestamp}.${extension}`;
}

/**
 * Sanitize field name for sensitive data
 */
export function isSensitiveField(fieldName: string): boolean {
  const lowerName = fieldName.toLowerCase();

  return (
    lowerName.includes('password') ||
    lowerName.includes('token') ||
    lowerName.includes('secret') ||
    lowerName.includes('key') && lowerName.includes('api')
  );
}

/**
 * Format value for export
 */
export function formatExportValue(value: unknown, fieldName?: string): unknown {
  // Redact sensitive fields
  if (fieldName && isSensitiveField(fieldName)) {
    return '[REDACTED]';
  }

  // Handle null/undefined
  if (value === null || value === undefined) {
    return '';
  }

  // Handle dates
  if (value instanceof Date) {
    return value;
  }

  // Handle date strings
  if (typeof value === 'string') {
    const datePattern = /^\d{4}-\d{2}-\d{2}(T|\s)/;
    if (datePattern.test(value)) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }

  return value;
}
