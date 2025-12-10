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
  /** @deprecated Use monthName instead - abbreviations are not preferred */
  shortMonth: string;
  year: number;
  monthYear: string;
  date: Date;
} {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthName = lastMonth.toLocaleString('en-US', { month: 'long' });
  const year = lastMonth.getFullYear();

  return {
    monthName,
    shortMonth: monthName, // Now returns full month name for backward compatibility
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
 * Get the report card month as a Date object
 * 
 * Convenience function for services that need the raw Date.
 * Returns the first day of the last full month.
 */
export function getReportCardMonthDate(): Date {
  return getReportCardMonth().date;
}

/**
 * Get the report card month as an ISO date string (YYYY-MM-DD)
 * 
 * Used for database queries and API parameters.
 * Returns the first day of the last full month in ISO format.
 */
export function getReportCardMonthString(): string {
  const date = getReportCardMonth().date;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

/**
 * Get the prior months for trend comparison
 * 
 * @param reportCardMonth - The report card month to calculate from
 * @param monthsBack - Number of months to go back (3, 6, or 9)
 * @returns Object with month range description using full month names
 */
export function getPriorMonthsRange(reportCardMonth: Date, monthsBack: number): {
  startMonth: string;
  endMonth: string;
  rangeLabel: string;
} {
  // Prior months are the months BEFORE the report card month
  // e.g., for November with 3 months back: August, September, October
  const endDate = new Date(reportCardMonth);
  endDate.setMonth(endDate.getMonth() - 1); // October (month before November)
  
  const startDate = new Date(reportCardMonth);
  startDate.setMonth(startDate.getMonth() - monthsBack); // August (3 months before November)
  
  const startMonth = startDate.toLocaleString('en-US', { month: 'long' });
  const endMonth = endDate.toLocaleString('en-US', { month: 'long' });
  
  return {
    startMonth,
    endMonth,
    rangeLabel: `${startMonth}-${endMonth}`,
  };
}

// =============================================================================
// Grade Utilities (Shared)
// =============================================================================

/** Grade floor - minimum score is 70 (C-) */
const GRADE_FLOOR = 70;

/**
 * Apply grade floor - ensures minimum C- grade
 * Scores below 70 are floored to 70 (C-)
 * 
 * @param rawScore - The raw score (0-100)
 * @returns Score floored to minimum of 70
 */
export function applyGradeFloor(rawScore: number): number {
  return Math.max(GRADE_FLOOR, rawScore);
}

/**
 * Get letter grade from score (0-100)
 * Uses floored score - no D's or F's, minimum is C-
 * 
 * Grade scale:
 * - 97-100: A+
 * - 93-96: A
 * - 90-92: A-
 * - 87-89: B+
 * - 83-86: B
 * - 80-82: B-
 * - 77-79: C+
 * - 73-76: C
 * - 70-72: C- (minimum)
 * 
 * @param rawScore - The raw score (0-100)
 * @returns Letter grade string (e.g., "A+", "B", "C-")
 */
export function getLetterGrade(rawScore: number): string {
  const score = applyGradeFloor(rawScore);
  
  if (score >= 97) return 'A+';
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  return 'C-';
}

/**
 * Get color class for a grade
 * 
 * @param grade - Letter grade string
 * @returns Tailwind color class
 */
export function getGradeColor(grade: string): string {
  if (grade.startsWith('A')) return 'text-emerald-500';
  if (grade.startsWith('B')) return 'text-teal-500';
  return 'text-amber-500';
}

/**
 * Get background color class for a grade
 * 
 * @param grade - Letter grade string
 * @returns Tailwind background color class
 */
export function getGradeBgColor(grade: string): string {
  if (grade.startsWith('A')) return 'bg-emerald-500/10';
  if (grade.startsWith('B')) return 'bg-teal-500/10';
  return 'bg-amber-500/10';
}

/**
 * Compare two grades
 * 
 * @param grade1 - First grade
 * @param grade2 - Second grade
 * @returns Positive if grade1 > grade2, negative if grade1 < grade2, 0 if equal
 */
export function compareGrades(grade1: string, grade2: string): number {
  const gradeOrder = ['C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+'];
  const idx1 = gradeOrder.indexOf(grade1);
  const idx2 = gradeOrder.indexOf(grade2);
  return idx1 - idx2;
}

