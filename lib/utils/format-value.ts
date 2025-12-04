/**
 * Value Formatting Utilities
 *
 * Shared formatting functions for displaying numbers across the application.
 * Supports compact notation (K/M/B), currency, percentages, and plain numbers.
 */

/**
 * Format a number with compact notation (K, M, B)
 *
 * @param value - The number to format
 * @param options - Formatting options
 * @returns Formatted string
 *
 * @example
 * formatCompactValue(1234567) // "1.2M"
 * formatCompactValue(1234567, { style: 'currency' }) // "$1.2M"
 * formatCompactValue(0.456, { style: 'percentage' }) // "45.6%"
 */
export function formatCompactValue(
  value: number,
  options: {
    style?: 'number' | 'currency' | 'percentage';
    decimals?: number;
    forceCompact?: boolean;
  } = {}
): string {
  const { style = 'number', decimals = 1, forceCompact = true } = options;

  // Handle percentage style differently
  if (style === 'percentage') {
    return `${value.toFixed(decimals)}%`;
  }

  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const prefix = style === 'currency' ? '$' : '';

  // Determine suffix and divisor
  let suffix = '';
  let divisor = 1;

  if (forceCompact) {
    if (absValue >= 1_000_000_000) {
      suffix = 'B';
      divisor = 1_000_000_000;
    } else if (absValue >= 1_000_000) {
      suffix = 'M';
      divisor = 1_000_000;
    } else if (absValue >= 1_000) {
      suffix = 'K';
      divisor = 1_000;
    }
  }

  const formatted = (absValue / divisor).toFixed(decimals);

  // Remove trailing zeros after decimal
  const cleanFormatted = formatted.replace(/\.?0+$/, '');

  return `${sign}${prefix}${cleanFormatted}${suffix}`;
}

/**
 * Format a value based on measure type
 *
 * @param value - The number to format
 * @param measureName - The measure name to determine format type
 * @param compact - Whether to use compact notation
 * @returns Formatted string
 */
export function formatMeasureValue(
  value: number,
  measureName: string,
  compact = true
): string {
  const lowerName = measureName.toLowerCase();

  // Currency measures
  if (
    lowerName.includes('charge') ||
    lowerName.includes('payment') ||
    lowerName.includes('cash') ||
    lowerName.includes('ar') ||
    lowerName.includes('revenue') ||
    lowerName.includes('collection')
  ) {
    if (compact) {
      return formatCompactValue(value, { style: 'currency' });
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  // Percentage measures
  if (lowerName.includes('rate') || lowerName.includes('percent')) {
    return `${value.toFixed(1)}%`;
  }

  // Number measures (visits, patients, etc.)
  if (compact) {
    return formatCompactValue(value, { style: 'number' });
  }
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Determine if higher values are better for a measure
 *
 * @param measureName - The measure name
 * @returns true if higher is better
 */
export function isHigherBetter(measureName: string): boolean {
  const lowerName = measureName.toLowerCase();

  // Lower is better for these
  if (
    lowerName.includes('denial') ||
    lowerName.includes('cancel') ||
    lowerName.includes('unsigned') ||
    lowerName.includes('task') ||
    lowerName.includes('ar days') ||
    lowerName.includes('wait time')
  ) {
    return false;
  }

  // Higher is better for most financial/volume metrics
  return true;
}

/**
 * Get the report card month (last full month)
 * This is the primary month for all report card calculations
 *
 * @returns Object with month details
 */
export function getReportCardMonth(): {
  monthName: string;
  shortMonth: string;
  year: number;
  monthYear: string;
  date: Date;
} {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthName = lastMonth.toLocaleString('en-US', { month: 'long' });
  const shortMonth = lastMonth.toLocaleString('en-US', { month: 'short' });
  const year = lastMonth.getFullYear();

  return {
    monthName,
    shortMonth,
    year,
    monthYear: `${monthName} ${year}`,
    date: lastMonth,
  };
}

/**
 * Get the last full month name and year
 * @deprecated Use getReportCardMonth() instead for clarity
 * @returns Object with month name and year
 */
export function getLastFullMonth(): { monthName: string; year: number; monthYear: string } {
  const { monthName, year, monthYear } = getReportCardMonth();
  return { monthName, year, monthYear };
}

/**
 * Get the prior months for trend comparison
 * 
 * @param reportCardMonth - The report card month to calculate from
 * @param monthsBack - Number of months to go back (3, 6, or 9)
 * @returns Object with month range description
 */
export function getPriorMonthsRange(reportCardMonth: Date, monthsBack: number): {
  startMonth: string;
  endMonth: string;
  rangeLabel: string;
} {
  // Prior months are the months BEFORE the report card month
  // e.g., for November with 3 months back: Aug, Sep, Oct
  const endDate = new Date(reportCardMonth);
  endDate.setMonth(endDate.getMonth() - 1); // Oct (month before Nov)
  
  const startDate = new Date(reportCardMonth);
  startDate.setMonth(startDate.getMonth() - monthsBack); // Aug (3 months before Nov)
  
  const startMonth = startDate.toLocaleString('en-US', { month: 'short' });
  const endMonth = endDate.toLocaleString('en-US', { month: 'short' });
  
  return {
    startMonth,
    endMonth,
    rangeLabel: `${startMonth}-${endMonth}`,
  };
}


