/**
 * Value Formatter for Chart Data
 *
 * Handles formatting of numeric values for different measure types.
 * Extracted from SimplifiedChartTransformer for reusability.
 */

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
 * @param value - Numeric value to format
 * @param measureType - Type of measure ('currency', 'count', 'percentage', 'number')
 * @returns Compact formatted string representation
 */
export function formatValueCompact(value: number, measureType: string): string {
  const absValue = Math.abs(value);
  let abbreviated: string;

  if (absValue >= 1_000_000_000) {
    abbreviated = `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  } else if (absValue >= 1_000_000) {
    abbreviated = `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  } else if (absValue >= 1_000) {
    abbreviated = `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  } else {
    abbreviated = value.toString();
  }

  // Add currency symbol for currency types
  if (measureType === 'currency') {
    return `$${abbreviated}`;
  }

  return abbreviated;
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
