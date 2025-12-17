/**
 * Table Cell Formatters
 *
 * Server-side formatters for table chart data.
 * Converts raw database values into display-ready formatted strings.
 *
 * Phase 3.2: Complete server-side table formatting
 */

import { log } from '@/lib/logger';

/**
 * Format types supported by the table formatter
 */
export type FormatType =
  | 'currency'
  | 'date'
  | 'datetime'
  | 'time'
  | 'integer'
  | 'decimal'
  | 'percentage'
  | 'phone'
  | 'email'
  | 'boolean'
  | 'text'
  | null;

/**
 * Infer format type from data type
 *
 * When a column has no explicit format_type set, this function infers
 * the appropriate format type from the column's data_type. This ensures
 * dates are formatted as dates (not ISO strings), integers as integers, etc.
 *
 * @param dataType - The column's data type (e.g., 'date', 'integer', 'decimal')
 * @returns The inferred format type, or null if no inference is possible
 */
export function inferFormatFromDataType(dataType: string | null | undefined): FormatType {
  if (!dataType) return null;

  const typeMap: Record<string, FormatType> = {
    date: 'date',
    datetime: 'datetime',
    timestamp: 'datetime',
    timestamptz: 'datetime',
    integer: 'integer',
    int: 'integer',
    bigint: 'integer',
    smallint: 'integer',
    decimal: 'decimal',
    numeric: 'decimal',
    float: 'decimal',
    double: 'decimal',
    real: 'decimal',
    boolean: 'boolean',
    bool: 'boolean',
  };

  return typeMap[dataType.toLowerCase()] || null;
}

/**
 * Formatted cell value with both display and raw values
 */
export interface FormattedCell {
  formatted: string; // Display value (e.g., "$1,000.00")
  raw: unknown; // Original value for sorting/exporting
  icon?: {
    // Icon metadata if applicable
    name: string;
    color?: string;
    type?: string;
  };
}

/**
 * Currency formatter options
 */
interface CurrencyOptions {
  locale?: string;
  currency?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

/**
 * Date formatter options
 */
interface DateOptions {
  locale?: string;
  format?: 'short' | 'medium' | 'long' | 'full';
  includeTime?: boolean;
}

/**
 * Number formatter options
 */
interface NumberOptions {
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  useGrouping?: boolean;
}

/**
 * Format a currency value
 *
 * @param value - Numeric value to format
 * @param options - Currency formatting options
 * @returns Formatted currency string (e.g., "$1,234.56")
 */
export function formatCurrency(value: unknown, options: CurrencyOptions = {}): string {
  const {
    locale = 'en-US',
    currency = 'USD',
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
  } = options;

  // Handle null/undefined
  if (value === null || value === undefined) {
    return '$0.00';
  }

  // Convert to number
  const numValue = typeof value === 'string' ? parseFloat(value) : Number(value);

  // Handle NaN
  if (Number.isNaN(numValue)) {
    log.warn('Invalid currency value', { value, type: typeof value });
    return '$0.00';
  }

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(numValue);
  } catch (error) {
    log.error('Currency formatting failed', error, { value, locale, currency });
    return `$${numValue.toFixed(2)}`;
  }
}

/**
 * Format a date value
 *
 * @param value - Date value (string, Date, or timestamp)
 * @param options - Date formatting options
 * @returns Formatted date string (e.g., "Jan 15, 2024")
 */
export function formatDate(value: unknown, options: DateOptions = {}): string {
  const { locale = 'en-US', format = 'medium', includeTime = false } = options;

  // Handle null/undefined
  if (value === null || value === undefined) {
    return '';
  }

  // Convert to Date
  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string' || typeof value === 'number') {
    date = new Date(value);
  } else {
    log.warn('Invalid date value', { value, type: typeof value });
    return String(value);
  }

  // Check for invalid date
  if (Number.isNaN(date.getTime())) {
    log.warn('Invalid date conversion', { value });
    return String(value);
  }

  try {
    const dateStyle = format;
    const timeStyle = includeTime ? format : undefined;

    return new Intl.DateTimeFormat(locale, {
      dateStyle,
      timeStyle,
    }).format(date);
  } catch (error) {
    log.error('Date formatting failed', error, { value, locale, format });
    return date.toLocaleDateString();
  }
}

/**
 * Format a time value
 *
 * @param value - Time value (Date, string, or timestamp)
 * @param options - Date formatting options
 * @returns Formatted time string (e.g., "2:30 PM")
 */
export function formatTime(value: unknown, options: DateOptions = {}): string {
  const { locale = 'en-US', format = 'short' } = options;

  // Handle null/undefined
  if (value === null || value === undefined) {
    return '';
  }

  // Convert to Date
  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'string' || typeof value === 'number') {
    date = new Date(value);
  } else {
    log.warn('Invalid time value', { value, type: typeof value });
    return String(value);
  }

  // Check for invalid date
  if (Number.isNaN(date.getTime())) {
    log.warn('Invalid time conversion', { value });
    return String(value);
  }

  try {
    return new Intl.DateTimeFormat(locale, {
      timeStyle: format,
    }).format(date);
  } catch (error) {
    log.error('Time formatting failed', error, { value, locale, format });
    return date.toLocaleTimeString();
  }
}

/**
 * Format an integer value with grouping
 *
 * @param value - Numeric value to format
 * @param options - Number formatting options
 * @returns Formatted integer string (e.g., "1,234,567")
 */
export function formatInteger(value: unknown, options: NumberOptions = {}): string {
  const { locale = 'en-US', useGrouping = true } = options;

  // Handle null/undefined
  if (value === null || value === undefined) {
    return '0';
  }

  // Convert to number
  const numValue = typeof value === 'string' ? parseFloat(value) : Number(value);

  // Handle NaN
  if (Number.isNaN(numValue)) {
    log.warn('Invalid integer value', { value, type: typeof value });
    return '0';
  }

  try {
    return new Intl.NumberFormat(locale, {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      useGrouping,
    }).format(numValue);
  } catch (error) {
    log.error('Integer formatting failed', error, { value, locale });
    return String(Math.round(numValue));
  }
}

/**
 * Format a decimal value with specified precision
 *
 * @param value - Numeric value to format
 * @param options - Number formatting options
 * @returns Formatted decimal string (e.g., "1,234.57")
 */
export function formatDecimal(value: unknown, options: NumberOptions = {}): string {
  const {
    locale = 'en-US',
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
    useGrouping = true,
  } = options;

  // Handle null/undefined
  if (value === null || value === undefined) {
    return '0.00';
  }

  // Convert to number
  const numValue = typeof value === 'string' ? parseFloat(value) : Number(value);

  // Handle NaN
  if (Number.isNaN(numValue)) {
    log.warn('Invalid decimal value', { value, type: typeof value });
    return '0.00';
  }

  try {
    return new Intl.NumberFormat(locale, {
      style: 'decimal',
      minimumFractionDigits,
      maximumFractionDigits,
      useGrouping,
    }).format(numValue);
  } catch (error) {
    log.error('Decimal formatting failed', error, { value, locale });
    return numValue.toFixed(maximumFractionDigits);
  }
}

/**
 * Format a percentage value
 *
 * @param value - Numeric value (0.0-1.0 or 0-100 depending on input)
 * @param isDecimal - If true, treats 0.85 as 85%, if false treats 85 as 85%
 * @returns Formatted percentage string (e.g., "85%")
 */
export function formatPercentage(value: unknown, isDecimal = true): string {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return '0%';
  }

  // Convert to number
  const numValue = typeof value === 'string' ? parseFloat(value) : Number(value);

  // Handle NaN
  if (Number.isNaN(numValue)) {
    log.warn('Invalid percentage value', { value, type: typeof value });
    return '0%';
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'percent',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(isDecimal ? numValue : numValue / 100);
  } catch (error) {
    log.error('Percentage formatting failed', error, { value, isDecimal });
    const percentValue = isDecimal ? numValue * 100 : numValue;
    return `${percentValue.toFixed(2)}%`;
  }
}

/**
 * Format a phone number
 *
 * @param value - Phone number string or number
 * @returns Formatted phone string (e.g., "(555) 123-4567")
 */
export function formatPhone(value: unknown): string {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return '';
  }

  // Convert to string and remove non-digits
  const cleaned = String(value).replace(/\D/g, '');

  // Format based on length
  if (cleaned.length === 10) {
    // US format: (555) 123-4567
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }

  if (cleaned.length === 11 && cleaned[0] === '1') {
    // US format with country code: +1 (555) 123-4567
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }

  // Return original if can't format
  return String(value);
}

/**
 * Format an email address (no formatting, just validation)
 *
 * @param value - Email address string
 * @returns Email string or empty if invalid
 */
export function formatEmail(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const email = String(value).trim();

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    log.warn('Invalid email format', { email });
  }

  return email;
}

/**
 * Format a boolean value
 *
 * @param value - Boolean value
 * @param trueLabel - Label for true (default: "Yes")
 * @param falseLabel - Label for false (default: "No")
 * @returns Formatted boolean string
 */
export function formatBoolean(value: unknown, trueLabel = 'Yes', falseLabel = 'No'): string {
  if (value === null || value === undefined) {
    return falseLabel;
  }

  // Convert to boolean
  const boolValue = Boolean(value);

  return boolValue ? trueLabel : falseLabel;
}

/**
 * Main formatter function that routes to specific formatters
 *
 * @param value - Raw value to format
 * @param formatType - Type of formatting to apply
 * @param iconMapping - Optional icon mapping configuration
 * @returns Formatted cell with display and raw values
 */
export function formatTableCell(
  value: unknown,
  formatType: FormatType,
  iconMapping?: Record<string, unknown>
): FormattedCell {
  let formatted: string;

  // Apply formatting based on type
  switch (formatType) {
    case 'currency':
      formatted = formatCurrency(value);
      break;

    case 'date':
      formatted = formatDate(value);
      break;

    case 'datetime':
      formatted = formatDate(value, { includeTime: true });
      break;

    case 'time':
      formatted = formatTime(value);
      break;

    case 'integer':
      formatted = formatInteger(value);
      break;

    case 'decimal':
      formatted = formatDecimal(value);
      break;

    case 'percentage':
      formatted = formatPercentage(value, true); // Assume decimal input (0.85 = 85%)
      break;

    case 'phone':
      formatted = formatPhone(value);
      break;

    case 'email':
      formatted = formatEmail(value);
      break;

    case 'boolean':
      formatted = formatBoolean(value);
      break;

    default:
      // No formatting, just convert to string
      formatted = value === null || value === undefined ? '' : String(value);
      break;
  }

  const result: FormattedCell = {
    formatted,
    raw: value,
  };

  // Apply icon mapping if provided
  if (iconMapping && value !== null && value !== undefined) {
    const valueKey = String(value);
    const iconConfig = iconMapping[valueKey] as
      | { name?: string; color?: string; type?: string }
      | undefined;

    if (iconConfig?.name) {
      result.icon = {
        name: iconConfig.name,
        ...(iconConfig.color && { color: iconConfig.color }),
        ...(iconConfig.type && { type: iconConfig.type }),
      };
    }
  }

  return result;
}

/**
 * Batch format multiple rows of table data
 *
 * @param data - Array of row data objects
 * @param columnFormats - Map of column names to format types
 * @param columnIconMappings - Map of column names to icon mappings
 * @returns Array of formatted row data
 */
export function formatTableData(
  data: Record<string, unknown>[],
  columnFormats: Map<string, FormatType>,
  columnIconMappings: Map<string, Record<string, unknown>>
): Array<Record<string, FormattedCell>> {
  const startTime = Date.now();

  try {
    const formattedData = data.map((row) => {
      const formattedRow: Record<string, FormattedCell> = {};

      for (const [columnName, value] of Object.entries(row)) {
        const formatType = columnFormats.get(columnName) || null;
        const iconMapping = columnIconMappings.get(columnName);

        formattedRow[columnName] = formatTableCell(value, formatType, iconMapping);
      }

      return formattedRow;
    });

    const duration = Date.now() - startTime;

    log.info('Table data formatted', {
      rowCount: data.length,
      columnCount: columnFormats.size,
      duration,
    });

    return formattedData;
  } catch (error) {
    log.error('Table data formatting failed', error, {
      rowCount: data.length,
      columnCount: columnFormats.size,
    });
    throw error;
  }
}
