/**
 * Client-Side Chart Data Filter
 *
 * Filters already-transformed chart data without requiring a server roundtrip.
 * Used by filter drill-down to provide instant filtering of existing data.
 *
 * Key insight: For filter drill-down, we already have the transformed Chart.js
 * data structure. We can filter the datasets directly rather than re-fetching
 * and re-transforming from the database.
 *
 * @module lib/utils/chart-data-filter
 */

import type { BatchChartData } from '@/lib/services/dashboard-rendering/mappers';
import type { ChartDataset } from '@/lib/types/analytics';
import type { TableRow } from '@/lib/types/data-rows';
import type { DrillDownFilter } from '@/lib/types/drill-down';

/**
 * Filter chart data client-side based on drill-down filters
 *
 * This is optimized for the filter drill-down use case where:
 * - We already have transformed Chart.js data
 * - We want to filter by series (dataset label) or data values
 * - No network call needed
 *
 * @param chartData - The existing BatchChartData from the chart
 * @param filters - Array of drill-down filters to apply
 * @returns Filtered BatchChartData ready for rendering
 */
export function filterChartDataClientSide(
  chartData: BatchChartData,
  filters: DrillDownFilter[]
): BatchChartData {
  if (!filters || filters.length === 0) {
    return chartData;
  }

  // Clone the chart data to avoid mutation
  const filteredChartData = structuredClone(chartData.chartData);
  const datasets = filteredChartData.datasets;

  // Find series filter (matches dataset labels in multi-series charts)
  const seriesFilter = findSeriesFilter(filters, datasets);

  if (seriesFilter && datasets.length > 1) {
    // Multi-series chart: filter datasets by label
    filteredChartData.datasets = datasets.filter((ds) => {
      const label = ds.label.toLowerCase();
      const filterValue = String(seriesFilter.value).toLowerCase();
      return label.includes(filterValue) || filterValue.includes(label);
    });
  }

  // Also filter rawData if present (for table views or detailed drilldowns)
  let filteredRawData = chartData.rawData;
  if (chartData.rawData && chartData.rawData.length > 0) {
    filteredRawData = filterRawData(chartData.rawData, filters);
  }

  return {
    ...chartData,
    chartData: filteredChartData,
    rawData: filteredRawData,
    metadata: {
      ...chartData.metadata,
      recordCount: filteredRawData.length,
    },
  };
}

/**
 * Find a filter that matches a dataset label
 */
function findSeriesFilter(
  filters: DrillDownFilter[],
  datasets: ChartDataset[]
): DrillDownFilter | null {
  const datasetLabels = datasets.map((ds) => ds.label.toLowerCase());

  for (const filter of filters) {
    const filterValue = String(filter.value).toLowerCase();
    // Check if any dataset label matches this filter value
    if (datasetLabels.some((label) => label.includes(filterValue) || filterValue.includes(label))) {
      return filter;
    }
  }

  return null;
}

/**
 * Filter raw data records based on drill-down filters
 * Uses flexible string matching for field values
 */
function filterRawData(
  rawData: TableRow[],
  filters: DrillDownFilter[]
): TableRow[] {
  if (rawData.length === 0) return rawData;

  return rawData.filter((row) => {
    return filters.every((filter) => {
      const rowValue = row[filter.field];
      if (rowValue === undefined || rowValue === null) {
        // Try common field name variations
        const value = findFieldValue(row, filter.field);
        if (value === undefined) return false;
        return matchValues(value, filter.value);
      }
      return matchValues(rowValue, filter.value);
    });
  });
}

/**
 * Try to find a field value with common name variations
 */
function findFieldValue(
  row: TableRow,
  fieldName: string
): TableRow[keyof TableRow] | undefined {
  // Direct match
  if (row[fieldName] !== undefined) {
    return row[fieldName];
  }

  // Try snake_case to camelCase and vice versa
  const snakeCase = fieldName.replace(/([A-Z])/g, '_$1').toLowerCase();
  const camelCase = fieldName.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

  if (row[snakeCase] !== undefined) return row[snakeCase];
  if (row[camelCase] !== undefined) return row[camelCase];

  return undefined;
}

/**
 * Check if two values match (case-insensitive for strings)
 */
function matchValues(actual: TableRow[keyof TableRow], expected: string | number): boolean {
  if (actual === expected) return true;
  if (actual === undefined || actual === null) return false;

  const actualStr = String(actual).toLowerCase().trim();
  const expectedStr = String(expected).toLowerCase().trim();

  // Exact match
  if (actualStr === expectedStr) return true;

  // Partial match (for truncated labels)
  if (actualStr.includes(expectedStr) || expectedStr.includes(actualStr)) {
    return true;
  }

  return false;
}

/**
 * Check if client-side filtering is possible for this chart data
 *
 * Client-side filtering works best when:
 * - We have the chartData with datasets
 * - The filter is on a series/group field (matches dataset labels)
 *
 * @param chartData - The chart data to check
 * @param filters - The filters to apply
 * @returns true if client-side filtering can handle these filters
 */
export function canFilterClientSide(
  chartData: BatchChartData,
  filters: DrillDownFilter[]
): boolean {
  if (!chartData.chartData.datasets || chartData.chartData.datasets.length === 0) {
    return false;
  }

  // Check if any filter matches dataset labels (series filter)
  const seriesFilter = findSeriesFilter(filters, chartData.chartData.datasets);

  // Client-side filtering works for series filters
  return seriesFilter !== null;
}

