/**
 * Data Aggregator Service
 *
 * Centralized data grouping and aggregation logic for chart transformations.
 * Extracted from SimplifiedChartTransformer to eliminate duplication.
 */

import type { AggAppMeasure } from '@/lib/types/analytics';
import { parseNumericValue } from '../formatters/value-formatter';

// Helper functions for safe dynamic column access
const getDate = (m: AggAppMeasure): string => {
  return (m.date_index ?? m.date_value ?? '') as string;
};

const getMeasureValue = (m: AggAppMeasure): string | number => {
  const value = m.measure_value ?? m.numeric_value ?? 0;
  return typeof value === 'string' || typeof value === 'number' ? value : 0;
};

/**
 * Aggregation types supported by the aggregator
 */
export type AggregationType = 'sum' | 'avg' | 'count' | 'min' | 'max';

/**
 * Group data by a field and date, storing values in arrays for aggregation
 *
 * @param measures - Array of measure records
 * @param groupByField - Field to group by (e.g., 'provider_name', 'practice')
 * @returns Map of group keys to date maps with value arrays
 */
export function groupByFieldAndDate(
  measures: AggAppMeasure[],
  groupByField: string
): Map<string, Map<string, number[]>> {
  const groupedData = new Map<string, Map<string, number[]>>();

  measures.forEach((measure) => {
    const groupKey = getGroupValue(measure, groupByField);
    const dateKey = getDate(measure);

    if (!groupedData.has(groupKey)) {
      groupedData.set(groupKey, new Map());
    }

    const dateMap = groupedData.get(groupKey);
    if (!dateMap) {
      throw new Error(`Date map not found for group key: ${groupKey}`);
    }

    if (!dateMap.has(dateKey)) {
      dateMap.set(dateKey, []);
    }

    const measureValue = parseNumericValue(getMeasureValue(measure));
    const dateValues = dateMap.get(dateKey);
    if (!dateValues) {
      throw new Error(`Date values not found for date key: ${dateKey}`);
    }
    dateValues.push(measureValue);
  });

  return groupedData;
}

/**
 * Group data by series label and date (for multi-series charts)
 *
 * @param measures - Array of measure records with series_label
 * @returns Map of series labels to date maps with value arrays
 */
export function groupBySeriesAndDate(
  measures: AggAppMeasure[]
): Map<string, Map<string, number[]>> {
  const groupedBySeries = new Map<string, Map<string, number[]>>();

  measures.forEach((measure) => {
    const seriesLabel = (measure.series_label ?? measure.measure ?? 'Unknown') as string;
    const dateKey = getDate(measure);

    if (!groupedBySeries.has(seriesLabel)) {
      groupedBySeries.set(seriesLabel, new Map());
    }

    const dateMap = groupedBySeries.get(seriesLabel);
    if (!dateMap) {
      throw new Error(`Date map not found for series: ${seriesLabel}`);
    }

    if (!dateMap.has(dateKey)) {
      dateMap.set(dateKey, []);
    }

    const measureValue = parseNumericValue(getMeasureValue(measure));
    const dateValues = dateMap.get(dateKey);
    if (!dateValues) {
      throw new Error(`Date values not found for date key: ${dateKey}`);
    }
    dateValues.push(measureValue);
  });

  return groupedBySeries;
}

/**
 * Aggregate values across all dates for a single group
 * (Used for horizontal bar charts, pie charts, etc.)
 *
 * @param measures - Array of measure records
 * @param groupByField - Field to group by
 * @param aggregationType - Type of aggregation to apply
 * @returns Map of group keys to aggregated values
 */
export function aggregateAcrossDates(
  measures: AggAppMeasure[],
  groupByField: string,
  aggregationType: AggregationType = 'sum'
): Map<string, number> {
  const aggregatedData = new Map<string, number>();

  measures.forEach((measure) => {
    const groupKey = getGroupValue(measure, groupByField);
    const measureValue = parseNumericValue(getMeasureValue(measure));

    const currentValue = aggregatedData.get(groupKey) || 0;

    switch (aggregationType) {
      case 'sum':
        aggregatedData.set(groupKey, currentValue + measureValue);
        break;
      case 'avg':
        // For average, we need to track count separately
        // This is a simplified version - caller should handle properly
        aggregatedData.set(groupKey, currentValue + measureValue);
        break;
      case 'count':
        aggregatedData.set(groupKey, currentValue + 1);
        break;
      case 'min':
        aggregatedData.set(
          groupKey,
          currentValue === 0 ? measureValue : Math.min(currentValue, measureValue)
        );
        break;
      case 'max':
        aggregatedData.set(groupKey, Math.max(currentValue, measureValue));
        break;
    }
  });

  return aggregatedData;
}

/**
 * Apply aggregation to an array of values
 *
 * @param values - Array of numeric values
 * @param aggregationType - Type of aggregation to apply
 * @returns Aggregated value
 */
export function applyAggregation(
  values: number[],
  aggregationType: AggregationType = 'sum'
): number {
  if (values.length === 0) return 0;

  switch (aggregationType) {
    case 'sum':
      return values.reduce((sum, val) => sum + val, 0);
    case 'avg':
      return values.reduce((sum, val) => sum + val, 0) / values.length;
    case 'count':
      return values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    default:
      return values.reduce((sum, val) => sum + val, 0);
  }
}

/**
 * Extract unique dates from measures and sort chronologically
 *
 * @param measures - Array of measure records
 * @returns Sorted array of date strings
 */
export function extractAndSortDates(measures: AggAppMeasure[]): string[] {
  const allDates = new Set<string>();

  measures.forEach((measure) => {
    allDates.add(getDate(measure));
  });

  return Array.from(allDates).sort(
    (a, b) => new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()
  );
}

/**
 * Filter dates to only include those with non-zero data
 *
 * @param sortedDates - Array of sorted date strings
 * @param groupedData - Grouped data map
 * @returns Array of date strings that have data
 */
export function filterDatesWithData(
  sortedDates: string[],
  groupedData: Map<string, Map<string, number[]>>
): string[] {
  return sortedDates.filter((dateIndex) => {
    return Array.from(groupedData.values()).some((dateMap) => {
      const value = dateMap.get(dateIndex) || [0];
      return value.some((v) => v > 0);
    });
  });
}

/**
 * Get value for grouping from measure object
 * Handles dynamic field access with proper fallbacks
 *
 * @param measure - Measure record
 * @param groupBy - Field name to group by
 * @returns String value for grouping
 */
export function getGroupValue(measure: AggAppMeasure, groupBy: string): string {
  // Direct property access - works for ANY field in the measure object
  const value = (measure as Record<string, unknown>)[groupBy];

  // Handle null, undefined, or empty values
  if (value == null || value === '') {
    // Generate fallback label
    const formattedFieldName = groupBy
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    return `Unknown ${formattedFieldName}`;
  }

  // Return string value or convert to string
  return typeof value === 'string' ? value : String(value);
}
