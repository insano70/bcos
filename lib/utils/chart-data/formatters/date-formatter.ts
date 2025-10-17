/**
 * Date Formatter for Chart Labels
 *
 * Handles date formatting for different chart types and frequencies.
 * Extracted from SimplifiedChartTransformer for reusability.
 */

/**
 * Format date label based on frequency
 *
 * @param dateIndex - Date string in ISO format (YYYY-MM-DD)
 * @param frequency - Time unit ('Weekly', 'Monthly', 'Quarterly')
 * @returns Formatted date string suitable for chart labels
 */
export function formatDateLabel(dateIndex: string, frequency: string): string {
  const date = new Date(`${dateIndex}T12:00:00Z`);

  switch (frequency) {
    case 'Weekly':
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });
    case 'Monthly':
      return date.toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      });
    case 'Quarterly': {
      const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
      return `Q${quarter} ${date.getUTCFullYear()}`;
    }
    default:
      return dateIndex;
  }
}

/**
 * Convert date index to Chart.js compatible Date object
 *
 * @param dateIndex - Date string in ISO format (YYYY-MM-DD)
 * @param frequency - Time unit ('Weekly', 'Monthly', 'Quarterly')
 * @returns Date object suitable for Chart.js time axis
 */
export function toChartJsDate(dateIndex: string, frequency: string): Date {
  const date = new Date(`${dateIndex}T12:00:00Z`);

  // Only convert to month-start for Monthly/Quarterly data
  // Keep actual dates for Weekly data
  if (frequency === 'Weekly') {
    return date; // Use actual weekly dates
  } else {
    // For Monthly/Quarterly, convert to first day of month for Chart.js
    return new Date(date.getUTCFullYear(), date.getUTCMonth(), 1, 12, 0, 0);
  }
}

/**
 * Convert date index to MM-DD-YYYY format string
 *
 * @param dateIndex - Date string in ISO format (YYYY-MM-DD)
 * @returns Date string in MM-DD-YYYY format
 */
export function toMMDDYYYY(dateIndex: string): string {
  const date = new Date(`${dateIndex}T12:00:00Z`);
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${month}-${day}-${year}`;
}

/**
 * Create category labels for bar charts based on frequency
 *
 * @param dateIndex - Date string in ISO format (YYYY-MM-DD)
 * @param frequency - Time unit ('Weekly', 'Monthly', 'Quarterly')
 * @returns Formatted category label
 */
export function createCategoryLabel(dateIndex: string, frequency: string): string {
  const date = new Date(`${dateIndex}T12:00:00Z`);

  if (frequency === 'Quarterly') {
    const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
    return `Q${quarter} ${date.getUTCFullYear()}`;
  } else if (frequency === 'Monthly') {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } else if (frequency === 'Weekly') {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  }

  return dateIndex;
}
