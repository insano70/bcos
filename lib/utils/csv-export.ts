/**
 * CSV Export Utility
 *
 * Provides functions to convert data arrays to CSV format and trigger downloads.
 * Handles proper escaping of special characters (commas, quotes, newlines).
 *
 * USAGE:
 * ```typescript
 * import { exportToCSV } from '@/lib/utils/csv-export';
 *
 * const data = [{ name: 'John', email: 'john@example.com' }];
 * const headers = { name: 'Name', email: 'Email Address' };
 *
 * exportToCSV(data, headers, 'users-export');
 * ```
 */

/**
 * Convert array of objects to CSV string
 *
 * @param data - Array of data objects
 * @param headers - Map of keys to column headers
 * @returns CSV string with headers and data rows
 */
export function convertToCSV<T extends Record<string, unknown>>(
  data: T[],
  headers: Record<keyof T, string>
): string {
  if (data.length === 0) {
    return Object.values(headers).join(',');
  }

  // Create header row
  const headerRow = Object.values(headers).join(',');

  // Create data rows
  const dataRows = data.map((row) =>
    (Object.keys(headers) as Array<keyof T>)
      .map((key) => {
        const value = row[key];

        // Handle null/undefined
        if (value === null || value === undefined) {
          return '""';
        }

        // Convert to string
        let stringValue = String(value);

        // Escape double quotes by doubling them (CSV standard)
        stringValue = stringValue.replace(/"/g, '""');

        // Wrap in quotes if contains comma, newline, or quote
        if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
          return `"${stringValue}"`;
        }

        // Wrap all values in quotes for consistency
        return `"${stringValue}"`;
      })
      .join(',')
  );

  return [headerRow, ...dataRows].join('\n');
}

/**
 * Trigger browser download of CSV file
 *
 * @param csvContent - CSV string content
 * @param filename - Filename without extension (will add .csv)
 */
export function downloadCSV(csvContent: string, filename: string): void {
  // Add .csv extension if not present
  const finalFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;

  // Create blob with UTF-8 BOM for Excel compatibility
  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });

  // Create download link
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = finalFilename;

  // Trigger download
  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/**
 * Export data to CSV and trigger download
 *
 * @param data - Array of data objects
 * @param headers - Map of keys to column headers
 * @param baseFilename - Base filename (timestamp will be added)
 */
export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  headers: Record<keyof T, string>,
  baseFilename: string
): void {
  // Generate CSV content
  const csvContent = convertToCSV(data, headers);

  // Add timestamp to filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${baseFilename}-${timestamp}`;

  // Trigger download
  downloadCSV(csvContent, filename);
}

/**
 * Format date for CSV export
 *
 * @param date - Date string or Date object
 * @returns Formatted date string (YYYY-MM-DD HH:MM:SS)
 */
export function formatDateForCSV(date: string | Date | null | undefined): string {
  if (!date) return '';

  const d = typeof date === 'string' ? new Date(date) : date;

  if (Number.isNaN(d.getTime())) return '';

  return d.toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Sanitize value for CSV export
 * Removes sensitive data and formats appropriately
 *
 * @param value - Value to sanitize
 * @param fieldName - Field name for context-aware sanitization
 * @returns Sanitized value
 */
export function sanitizeForCSV(value: unknown, fieldName?: string): string {
  if (value === null || value === undefined) {
    return '';
  }

  // Redact password fields
  if (fieldName?.toLowerCase().includes('password')) {
    return '[REDACTED]';
  }

  // Redact token fields
  if (fieldName?.toLowerCase().includes('token')) {
    return '[REDACTED]';
  }

  // Format dates
  if (value instanceof Date) {
    return formatDateForCSV(value);
  }

  // Format booleans
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  // Format numbers
  if (typeof value === 'number') {
    return value.toString();
  }

  // Convert objects to JSON string
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}
