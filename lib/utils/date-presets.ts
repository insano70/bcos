/**
 * Date Preset Utilities
 * Shared utility for calculating date ranges from presets
 * Can be used on both client and server side
 */

export type DatePresetId =
  // Day-based periods
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_14_days'
  | 'last_30_days'
  | 'last_90_days'
  | 'last_180_days'
  | 'last_365_days'
  // Month-based periods
  | 'this_month'
  | 'last_month'
  | 'last_3_full_months'
  | 'last_6_full_months'
  | 'last_12_full_months'
  // Quarter-based periods
  | 'this_quarter'
  | 'last_quarter'
  // Year-based periods
  | 'ytd'
  | 'this_year'
  | 'last_year'
  // Custom
  | 'custom';

export interface DateRange {
  startDate: string; // ISO date string YYYY-MM-DD
  endDate: string; // ISO date string YYYY-MM-DD
}

/**
 * Extract date portion (YYYY-MM-DD) from ISO string
 */
function toDateString(date: Date): string {
  const isoString = date.toISOString();
  const datePart = isoString.split('T')[0];
  return datePart || isoString.substring(0, 10);
}

/**
 * Calculate date range for a given preset
 * @param presetId - The preset identifier
 * @param referenceDate - Optional reference date (defaults to current date)
 * @returns Object with startDate and endDate as ISO strings
 */
export function calculateDateRangeFromPreset(
  presetId: DatePresetId,
  referenceDate: Date = new Date()
): DateRange {
  // For custom preset, return empty strings - caller must provide dates
  if (presetId === 'custom') {
    return { startDate: '', endDate: '' };
  }

  switch (presetId) {
    case 'today': {
      const today = new Date(referenceDate);
      return {
        startDate: toDateString(today),
        endDate: toDateString(today),
      };
    }

    case 'yesterday': {
      const yesterday = new Date(referenceDate);
      yesterday.setDate(yesterday.getDate() - 1);
      return {
        startDate: toDateString(yesterday),
        endDate: toDateString(yesterday),
      };
    }

    case 'last_7_days': {
      const end = new Date(referenceDate);
      const start = new Date(referenceDate);
      start.setDate(start.getDate() - 7);
      return {
        startDate: toDateString(start),
        endDate: toDateString(end),
      };
    }

    case 'last_14_days': {
      const end = new Date(referenceDate);
      const start = new Date(referenceDate);
      start.setDate(start.getDate() - 14);
      return {
        startDate: toDateString(start),
        endDate: toDateString(end),
      };
    }

    case 'last_30_days': {
      const end = new Date(referenceDate);
      const start = new Date(referenceDate);
      start.setDate(start.getDate() - 30);
      return {
        startDate: toDateString(start),
        endDate: toDateString(end),
      };
    }

    case 'last_90_days': {
      const end = new Date(referenceDate);
      const start = new Date(referenceDate);
      start.setDate(start.getDate() - 90);
      return {
        startDate: toDateString(start),
        endDate: toDateString(end),
      };
    }

    case 'last_180_days': {
      const end = new Date(referenceDate);
      const start = new Date(referenceDate);
      start.setDate(start.getDate() - 180);
      return {
        startDate: toDateString(start),
        endDate: toDateString(end),
      };
    }

    case 'last_365_days': {
      const end = new Date(referenceDate);
      const start = new Date(referenceDate);
      start.setDate(start.getDate() - 365);
      return {
        startDate: toDateString(start),
        endDate: toDateString(end),
      };
    }

    case 'this_month': {
      const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
      const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
      return {
        startDate: toDateString(start),
        endDate: toDateString(end),
      };
    }

    case 'last_month': {
      const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);
      const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 0);
      return {
        startDate: toDateString(start),
        endDate: toDateString(end),
      };
    }

    case 'last_3_full_months': {
      // End = last day of previous month
      const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 0);
      // Start = first day of (current month - 3)
      const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 3, 1);
      return {
        startDate: toDateString(start),
        endDate: toDateString(end),
      };
    }

    case 'last_6_full_months': {
      // End = last day of previous month
      const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 0);
      // Start = first day of (current month - 6)
      const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 6, 1);
      return {
        startDate: toDateString(start),
        endDate: toDateString(end),
      };
    }

    case 'last_12_full_months': {
      // End = last day of previous month
      const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 0);
      // Start = first day of (current month - 12)
      const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 12, 1);
      return {
        startDate: toDateString(start),
        endDate: toDateString(end),
      };
    }

    case 'this_quarter': {
      const quarter = Math.floor(referenceDate.getMonth() / 3);
      const start = new Date(referenceDate.getFullYear(), quarter * 3, 1);
      const end = new Date(referenceDate.getFullYear(), quarter * 3 + 3, 0);
      return {
        startDate: toDateString(start),
        endDate: toDateString(end),
      };
    }

    case 'last_quarter': {
      const quarter = Math.floor(referenceDate.getMonth() / 3) - 1;
      const year = quarter < 0 ? referenceDate.getFullYear() - 1 : referenceDate.getFullYear();
      const adjustedQuarter = quarter < 0 ? 3 : quarter;
      const start = new Date(year, adjustedQuarter * 3, 1);
      const end = new Date(year, adjustedQuarter * 3 + 3, 0);
      return {
        startDate: toDateString(start),
        endDate: toDateString(end),
      };
    }

    case 'ytd': {
      const start = new Date(referenceDate.getFullYear(), 0, 1);
      const end = new Date(referenceDate);
      return {
        startDate: toDateString(start),
        endDate: toDateString(end),
      };
    }

    case 'this_year': {
      const start = new Date(referenceDate.getFullYear(), 0, 1);
      const end = new Date(referenceDate.getFullYear(), 11, 31);
      return {
        startDate: toDateString(start),
        endDate: toDateString(end),
      };
    }

    case 'last_year': {
      const start = new Date(referenceDate.getFullYear() - 1, 0, 1);
      const end = new Date(referenceDate.getFullYear() - 1, 11, 31);
      return {
        startDate: toDateString(start),
        endDate: toDateString(end),
      };
    }

    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = presetId;
      throw new Error(`Unknown preset: ${_exhaustive}`);
    }
  }
}

/**
 * Check if a preset ID is valid
 */
export function isValidPreset(presetId: string): presetId is DatePresetId {
  const validPresets: DatePresetId[] = [
    'today',
    'yesterday',
    'last_7_days',
    'last_14_days',
    'last_30_days',
    'last_90_days',
    'last_180_days',
    'last_365_days',
    'this_month',
    'last_month',
    'last_3_full_months',
    'last_6_full_months',
    'last_12_full_months',
    'this_quarter',
    'last_quarter',
    'ytd',
    'this_year',
    'last_year',
    'custom',
  ];
  return validPresets.includes(presetId as DatePresetId);
}

/**
 * Get date range, preferring preset calculation over provided dates
 * @param presetId - Optional preset identifier
 * @param fallbackStartDate - Fallback start date if preset is custom or missing
 * @param fallbackEndDate - Fallback end date if preset is custom or missing
 * @returns Calculated or fallback date range
 */
export function getDateRange(
  presetId: string | undefined,
  fallbackStartDate: string | undefined,
  fallbackEndDate: string | undefined
): DateRange {
  // If we have a valid preset that's not custom, calculate dates dynamically
  if (presetId && isValidPreset(presetId) && presetId !== 'custom') {
    return calculateDateRangeFromPreset(presetId);
  }

  // Otherwise use provided dates or defaults
  return {
    startDate: fallbackStartDate || '',
    endDate: fallbackEndDate || '',
  };
}
