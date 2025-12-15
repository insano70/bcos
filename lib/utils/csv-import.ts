/**
 * CSV Import Utility
 *
 * Provides functions to parse CSV files for bulk user import.
 * Handles RFC 4180 compliant CSV parsing with support for:
 * - Quoted and unquoted values
 * - Escaped quotes within quoted values (doubled quotes)
 * - Commas within quoted values
 * - Mixed quoting styles within same row
 * - UTF-8 BOM handling
 *
 * USAGE:
 * ```typescript
 * import { parseCSV, validateCSVHeaders, generateCSVTemplate } from '@/lib/utils/csv-import';
 *
 * const result = parseCSV(csvContent);
 * if (result.success) {
 *   const rows = result.data;
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */

import { REQUIRED_CSV_HEADERS, type RawCSVRow, type CSVHeader } from '@/lib/validations/bulk-import';

/**
 * Result type for CSV parsing
 */
export type CSVParseResult<T> =
  | { success: true; data: T[]; headers: string[] }
  | { success: false; error: string };

/**
 * Result type for header validation
 */
export type HeaderValidationResult =
  | { valid: true; headers: string[] }
  | { valid: false; error: string; missingHeaders: string[] };

/**
 * UTF-8 BOM character
 */
const UTF8_BOM = '\uFEFF';

/**
 * Parse a CSV string into an array of objects
 *
 * Handles RFC 4180 compliant CSV:
 * - Fields may be quoted or unquoted
 * - Quoted fields may contain commas, newlines, and quotes
 * - Quotes within quoted fields are escaped by doubling ("")
 * - Leading/trailing whitespace is trimmed from values
 *
 * @param content - Raw CSV string content
 * @returns Parsed rows as objects keyed by header names, or error
 */
export function parseCSV(content: string): CSVParseResult<RawCSVRow> {
  // Remove UTF-8 BOM if present
  let normalizedContent = content;
  if (normalizedContent.startsWith(UTF8_BOM)) {
    normalizedContent = normalizedContent.slice(1);
  }

  // Normalize line endings to \n
  normalizedContent = normalizedContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Parse into rows and fields
  const lines = parseCSVLines(normalizedContent);

  if (lines.length === 0) {
    return { success: false, error: 'CSV file is empty' };
  }

  // First line is headers
  const headers = lines[0];
  if (!headers || headers.length === 0) {
    return { success: false, error: 'CSV file has no headers' };
  }

  // Normalize headers (lowercase, trim)
  const normalizedHeaders = headers.map((h) => h.toLowerCase().trim());

  // Validate required headers
  const headerValidation = validateCSVHeaders(normalizedHeaders);
  if (!headerValidation.valid) {
    return { success: false, error: headerValidation.error };
  }

  // Parse data rows
  const dataRows = lines.slice(1);
  if (dataRows.length === 0) {
    return { success: false, error: 'CSV file has no data rows' };
  }

  // Convert to objects
  const rows: RawCSVRow[] = [];
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (!row) continue;

    // Skip empty rows (all fields empty)
    if (row.every((field) => field.trim() === '')) {
      continue;
    }

    // Create object from row
    const rowObj: Record<string, string> = {};
    for (let j = 0; j < normalizedHeaders.length; j++) {
      const header = normalizedHeaders[j];
      const value = row[j] ?? '';
      if (header) {
        rowObj[header] = value.trim();
      }
    }

    // Cast to RawCSVRow (validation happens in service layer)
    rows.push(rowObj as unknown as RawCSVRow);
  }

  if (rows.length === 0) {
    return { success: false, error: 'CSV file has no valid data rows' };
  }

  return { success: true, data: rows, headers: normalizedHeaders };
}

/**
 * Parse CSV content into lines and fields using RFC 4180 rules
 *
 * @param content - Normalized CSV content (LF line endings)
 * @returns Array of rows, each row is array of field values
 */
function parseCSVLines(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < content.length) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (inQuotes) {
      // Inside quoted field
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote - add single quote and skip next
          currentField += '"';
          i += 2;
          continue;
        }
        // End of quoted field
        inQuotes = false;
        i++;
        continue;
      }
      // Regular character inside quotes
      currentField += char;
      i++;
      continue;
    }

    // Outside quoted field
    if (char === '"') {
      // Start of quoted field (only at beginning of field)
      if (currentField === '') {
        inQuotes = true;
        i++;
        continue;
      }
      // Quote in middle of unquoted field - treat as literal
      currentField += char;
      i++;
      continue;
    }

    if (char === ',') {
      // End of field
      currentRow.push(currentField);
      currentField = '';
      i++;
      continue;
    }

    if (char === '\n') {
      // End of row
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
      i++;
      continue;
    }

    // Regular character
    currentField += char;
    i++;
  }

  // Don't forget last field/row
  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Validate that required headers are present
 *
 * @param headers - Array of header names (lowercase, trimmed)
 * @returns Validation result with missing headers if invalid
 */
export function validateCSVHeaders(headers: string[]): HeaderValidationResult {
  const missingHeaders: string[] = [];

  for (const required of REQUIRED_CSV_HEADERS) {
    if (!headers.includes(required)) {
      missingHeaders.push(required);
    }
  }

  if (missingHeaders.length > 0) {
    return {
      valid: false,
      error: `Missing required headers: ${missingHeaders.join(', ')}`,
      missingHeaders,
    };
  }

  return { valid: true, headers };
}

/**
 * Parse pipe-delimited roles string into array
 *
 * @param rolesString - Pipe-delimited roles (e.g., "Admin|User")
 * @returns Array of role names, trimmed and filtered
 */
export function parseRoles(rolesString: string): string[] {
  if (!rolesString || rolesString.trim() === '') {
    return [];
  }

  return rolesString
    .split('|')
    .map((role) => role.trim())
    .filter((role) => role.length > 0);
}

/**
 * Generate CSV template for download
 *
 * @returns CSV template string with UTF-8 BOM, headers, and example row
 */
export function generateCSVTemplate(): string {
  const headers: CSVHeader[] = [
    'first_name',
    'last_name',
    'email',
    'organization',
    'password',
    'roles',
    'provider_uid',
  ];

  const exampleRow = [
    'John',
    'Doe',
    'john.doe@example.com',
    'Example Organization',
    'SecureP@ss123!',
    'Admin|User',
    '42',
  ];

  // Build CSV content with UTF-8 BOM for Excel compatibility
  const headerLine = headers.join(',');
  const exampleLine = exampleRow.map(escapeCSVField).join(',');

  return `${UTF8_BOM}${headerLine}\n${exampleLine}`;
}

/**
 * Escape a field value for CSV output
 * Wraps in quotes if contains special characters
 *
 * @param value - Field value to escape
 * @returns Escaped field value
 */
function escapeCSVField(value: string): string {
  // Escape double quotes by doubling them
  const escaped = value.replace(/"/g, '""');

  // Wrap in quotes if contains comma, newline, or quote
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    return `"${escaped}"`;
  }

  return escaped;
}

/**
 * Get file size limit for CSV uploads (5MB)
 */
export const CSV_FILE_SIZE_LIMIT = 5 * 1024 * 1024; // 5MB

/**
 * Parse a single CSV line into an array of field values
 *
 * Handles RFC 4180 compliant parsing:
 * - Quoted and unquoted fields
 * - Escaped quotes within quoted fields (doubled quotes)
 * - Commas within quoted values
 *
 * @param line - Single CSV line to parse
 * @returns Array of field values
 */
export function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote - add single quote and skip next
          current += '"';
          i++;
        } else {
          // End of quoted field
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        // Start of quoted field
        inQuotes = true;
      } else if (char === ',') {
        // End of field
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }
  // Don't forget last field
  values.push(current.trim());

  return values;
}

/**
 * Validate CSV file before parsing
 *
 * @param file - File object to validate
 * @returns Validation result
 */
export function validateCSVFile(
  file: File
): { valid: true } | { valid: false; error: string } {
  // Check file type
  const validTypes = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];
  const hasValidExtension = file.name.toLowerCase().endsWith('.csv');

  if (!validTypes.includes(file.type) && !hasValidExtension) {
    return { valid: false, error: 'Invalid file type. Please upload a CSV file.' };
  }

  // Check file size
  if (file.size > CSV_FILE_SIZE_LIMIT) {
    return { valid: false, error: 'File exceeds maximum size of 5MB.' };
  }

  // Check if file is empty
  if (file.size === 0) {
    return { valid: false, error: 'File is empty.' };
  }

  return { valid: true };
}
