/**
 * Period Comparison Utilities
 * Utility functions for calculating comparison date ranges based on frequency and comparison type
 */

import type { PeriodComparisonConfig, FrequencyType } from '@/lib/types/analytics';

export interface DateRange {
  start: string; // YYYY-MM-DD format
  end: string;   // YYYY-MM-DD format
}

/**
 * Calculate comparison date range based on current range, frequency, and comparison type
 */
export function calculateComparisonDateRange(
  currentStartDate: string,
  currentEndDate: string,
  frequency: FrequencyType,
  comparisonConfig: PeriodComparisonConfig
): DateRange {
  // Validate input parameters
  if (!currentStartDate || !currentEndDate) {
    throw new Error('Start date and end date are required');
  }

  if (!frequency) {
    throw new Error('Frequency is required');
  }

  if (!comparisonConfig || !comparisonConfig.enabled) {
    throw new Error('Period comparison configuration is required and must be enabled');
  }

  const startDate = new Date(currentStartDate);
  const endDate = new Date(currentEndDate);

  // Validate dates
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new Error('Invalid date format');
  }

  if (startDate >= endDate) {
    throw new Error('Start date must be before end date');
  }

  switch (comparisonConfig.comparisonType) {
    case 'previous_period':
      return calculatePreviousPeriodRange(startDate, endDate, frequency);
    
    case 'same_period_last_year':
      return calculateSamePeriodLastYearRange(startDate, endDate);
    
    case 'custom_period': {
      const offset = comparisonConfig.customPeriodOffset || 1;
      return calculateCustomPeriodRange(startDate, endDate, frequency, offset);
    }
    
    default:
      throw new Error(`Unsupported comparison type: ${comparisonConfig.comparisonType}`);
  }
}

/**
 * Calculate previous period range based on frequency
 */
function calculatePreviousPeriodRange(
  startDate: Date,
  endDate: Date,
  frequency: FrequencyType
): DateRange {
  const duration = endDate.getTime() - startDate.getTime();
  
  switch (frequency) {
    case 'Monthly':
      return calculateMonthlyPreviousPeriod(startDate, endDate);
    
    case 'Weekly':
      return calculateWeeklyPreviousPeriod(startDate, endDate);
    
    case 'Quarterly':
      return calculateQuarterlyPreviousPeriod(startDate, endDate);
    
    default: {
      // Fallback: subtract the same duration
      const previousStart = new Date(startDate.getTime() - duration);
      const previousEnd = new Date(endDate.getTime() - duration);
      return {
        start: formatDate(previousStart),
        end: formatDate(previousEnd)
      };
    }
  }
}

/**
 * Calculate previous month range
 */
function calculateMonthlyPreviousPeriod(startDate: Date, endDate: Date): DateRange {
  const previousStart = new Date(startDate);
  const previousEnd = new Date(endDate);
  
  // Go back one month
  previousStart.setMonth(previousStart.getMonth() - 1);
  previousEnd.setMonth(previousEnd.getMonth() - 1);
  
  return {
    start: formatDate(previousStart),
    end: formatDate(previousEnd)
  };
}

/**
 * Calculate previous week range
 */
function calculateWeeklyPreviousPeriod(startDate: Date, endDate: Date): DateRange {
  const previousStart = new Date(startDate);
  const previousEnd = new Date(endDate);
  
  // Go back 7 days
  previousStart.setDate(previousStart.getDate() - 7);
  previousEnd.setDate(previousEnd.getDate() - 7);
  
  return {
    start: formatDate(previousStart),
    end: formatDate(previousEnd)
  };
}

/**
 * Calculate previous quarter range
 */
function calculateQuarterlyPreviousPeriod(startDate: Date, endDate: Date): DateRange {
  const previousStart = new Date(startDate);
  const previousEnd = new Date(endDate);
  
  // Go back 3 months
  previousStart.setMonth(previousStart.getMonth() - 3);
  previousEnd.setMonth(previousEnd.getMonth() - 3);
  
  return {
    start: formatDate(previousStart),
    end: formatDate(previousEnd)
  };
}

/**
 * Calculate same period last year range
 */
function calculateSamePeriodLastYearRange(startDate: Date, endDate: Date): DateRange {
  const lastYearStart = new Date(startDate);
  const lastYearEnd = new Date(endDate);
  
  // Go back one year
  lastYearStart.setFullYear(lastYearStart.getFullYear() - 1);
  lastYearEnd.setFullYear(lastYearEnd.getFullYear() - 1);
  
  return {
    start: formatDate(lastYearStart),
    end: formatDate(lastYearEnd)
  };
}

/**
 * Calculate custom period range with specified offset
 */
function calculateCustomPeriodRange(
  startDate: Date,
  endDate: Date,
  frequency: FrequencyType,
  offset: number
): DateRange {
  const customStart = new Date(startDate);
  const customEnd = new Date(endDate);
  
  switch (frequency) {
    case 'Monthly':
      customStart.setMonth(customStart.getMonth() - offset);
      customEnd.setMonth(customEnd.getMonth() - offset);
      break;
    
    case 'Weekly':
      customStart.setDate(customStart.getDate() - (offset * 7));
      customEnd.setDate(customEnd.getDate() - (offset * 7));
      break;
    
    case 'Quarterly':
      customStart.setMonth(customStart.getMonth() - (offset * 3));
      customEnd.setMonth(customEnd.getMonth() - (offset * 3));
      break;
    
    default:
      // Fallback: subtract offset days
      customStart.setDate(customStart.getDate() - offset);
      customEnd.setDate(customEnd.getDate() - offset);
  }
  
  return {
    start: formatDate(customStart),
    end: formatDate(customEnd)
  };
}

/**
 * Format date to YYYY-MM-DD string
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Validate that comparison date range is reasonable
 */
export function validateComparisonDateRange(
  currentRange: DateRange,
  comparisonRange: DateRange
): { isValid: boolean; error?: string } {
  const currentStart = new Date(currentRange.start);
  const currentEnd = new Date(currentRange.end);
  const comparisonStart = new Date(comparisonRange.start);
  const comparisonEnd = new Date(comparisonRange.end);
  
  // Check if comparison range is in the past
  if (comparisonStart >= currentStart) {
    return {
      isValid: false,
      error: 'Comparison period must be before the current period'
    };
  }
  
  // Check if comparison range duration is reasonable (within 50% of current range)
  const currentDuration = currentEnd.getTime() - currentStart.getTime();
  const comparisonDuration = comparisonEnd.getTime() - comparisonStart.getTime();
  const durationRatio = comparisonDuration / currentDuration;
  
  if (durationRatio < 0.5 || durationRatio > 2) {
    return {
      isValid: false,
      error: 'Comparison period duration is significantly different from current period'
    };
  }
  
  return { isValid: true };
}

/**
 * Generate comparison label based on frequency and comparison type
 */
export function generateComparisonLabel(
  frequency: FrequencyType,
  comparisonConfig: PeriodComparisonConfig
): string {
  if (comparisonConfig.labelFormat && comparisonConfig.labelFormat !== 'Previous Period') {
    return comparisonConfig.labelFormat;
  }
  
  switch (comparisonConfig.comparisonType) {
    case 'previous_period':
      switch (frequency) {
        case 'Monthly':
          return 'Previous Month';
        case 'Weekly':
          return 'Previous Week';
        case 'Quarterly':
          return 'Previous Quarter';
        default:
          return 'Previous Period';
      }
    
    case 'same_period_last_year':
      switch (frequency) {
        case 'Monthly':
          return 'Same Month Last Year';
        case 'Weekly':
          return 'Same Week Last Year';
        case 'Quarterly':
          return 'Same Quarter Last Year';
        default:
          return 'Same Period Last Year';
      }
    
    case 'custom_period': {
      const offset = comparisonConfig.customPeriodOffset || 1;
      switch (frequency) {
        case 'Monthly':
          return `${offset} Month${offset > 1 ? 's' : ''} Ago`;
        case 'Weekly':
          return `${offset} Week${offset > 1 ? 's' : ''} Ago`;
        case 'Quarterly':
          return `${offset} Quarter${offset > 1 ? 's' : ''} Ago`;
        default:
          return `${offset} Period${offset > 1 ? 's' : ''} Ago`;
      }
    }
    
    default:
      return 'Previous Period';
  }
}
