/**
 * Value Formatter for Chart Data
 *
 * Handles formatting of numeric values for different measure types.
 * Extracted from SimplifiedChartTransformer for reusability.
 *
 * Uses canonical formatCompactValue from @/lib/utils/format-value for K/M/B notation.
 */

import { formatCompactValue } from '@/lib/utils/format-value';

/**
 * Format value based on measure type
 *
 * @param value - Numeric value to format
 * @param measureType - Type of measure ('currency', 'count', 'quantity', 'percentage', 'number')
 * @returns Formatted string representation
 */
export function formatValue(value: number, measureType: string): string {
  switch (measureType) {
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);

    case 'count':
    case 'quantity':
      return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value);

    case 'percentage':
      return `${value.toFixed(1)}%`;

    default:
      return value.toString();
  }
}

/**
 * Format value with abbreviations for compact display (e.g., Y-axis labels)
 * Converts large numbers to K, M, B notation
 *
 * Uses canonical formatCompactValue from @/lib/utils/format-value
 *
 * @param value - Numeric value to format
 * @param measureType - Type of measure ('currency', 'count', 'percentage', 'number')
 * @returns Compact formatted string representation
 */
export function formatValueCompact(value: number, measureType: string): string {
  const style = measureType === 'currency' ? 'currency' : 'number';
  return formatCompactValue(value, { style });
}

/**
 * Parse string value to number (handles both string and number inputs)
 *
 * @param value - Value to parse (string or number)
 * @returns Parsed numeric value
 */
export function parseNumericValue(value: string | number): number {
  return typeof value === 'string' ? parseFloat(value) : value;
}
