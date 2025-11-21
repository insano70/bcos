/**
 * Chart Filter Builder
 *
 * Extracts filters from chart data sources and builds runtime filters
 * by merging with universal dashboard filters.
 *
 * Single Responsibility:
 * - Extract filters from data_source
 * - Build runtime filters (merge data source + universal)
 * - Extract metadata for result tracking
 */

import type { ChartDefinition, ResolvedFilters } from './types';

/**
 * Data source filter (from chart definition)
 */
interface DataSourceFilter {
  field: string;
  operator?: string;
  value?: unknown;
}

/**
 * Extracted filters from data source
 */
export interface ExtractedFilters {
  measure?: DataSourceFilter | undefined;
  frequency?: DataSourceFilter | undefined;
  practice?: DataSourceFilter | undefined;
  startDate?: DataSourceFilter | undefined;
  endDate?: DataSourceFilter | undefined;
  advancedFilters: unknown[];
}

/**
 * Chart Filter Builder
 *
 * Handles all filter extraction and building operations.
 * Merges chart-level filters with dashboard-level universal filters.
 */
export class ChartFilterBuilder {
  /**
   * Extract filters from chart's data_source
   *
   * Parses data_source.filters array and extracts well-known filter types:
   * - measure (e.g., visits, revenue)
   * - frequency (e.g., daily, weekly, monthly)
   * - practice_uid (practice filter)
   * - date_index with gte operator (start date)
   * - date_index with lte operator (end date)
   * - advancedFilters (custom filter conditions)
   *
   * @param chart - Chart definition
   * @returns Extracted filters object
   */
  extractDataSourceFilters(chart: ChartDefinition): ExtractedFilters {
    const dataSource = (chart.data_source as {
      filters?: DataSourceFilter[];
      advancedFilters?: unknown[];
    }) || {};

    const filters = dataSource.filters || [];

    return {
      measure: filters.find((f) => f.field === 'measure'),
      frequency: filters.find((f) => f.field === 'frequency'),
      practice: filters.find((f) => f.field === 'practice_uid'),
      startDate: filters.find(
        (f) => f.field === 'date_index' && f.operator === 'gte'
      ),
      endDate: filters.find(
        (f) => f.field === 'date_index' && f.operator === 'lte'
      ),
      advancedFilters: dataSource.advancedFilters || [],
    };
  }

  /**
   * Build runtime filters (chart filters + universal overrides)
   *
   * Merges chart-level filters with dashboard-level universal filters.
   * Universal filters take precedence over chart-level filters.
   *
   * Security: Empty practiceUids arrays are NOT passed to prevent
   * unfiltered queries. Only non-empty arrays are included.
   *
   * @param extractedFilters - Filters extracted from data_source
   * @param universalFilters - Dashboard-level filters
   * @param chartConfig - Chart config for fallback values
   * @returns Runtime filters object
   */
  buildRuntimeFilters(
    extractedFilters: ExtractedFilters,
    universalFilters: ResolvedFilters,
    chartConfig?: { frequency?: string }
  ): Record<string, unknown> {
    const runtimeFilters: Record<string, unknown> = {};

    // Extract from data_source
    if (extractedFilters.measure?.value) {
      runtimeFilters.measure = extractedFilters.measure.value;
    }

    if (extractedFilters.frequency?.value) {
      runtimeFilters.frequency = extractedFilters.frequency.value;
    } else if (chartConfig?.frequency) {
      // Fallback to chart_config.frequency for multi-series/dual-axis charts
      runtimeFilters.frequency = chartConfig.frequency;
    }

    if (extractedFilters.practice?.value) {
      // Convert single practice to array for consistency
      runtimeFilters.practiceUids = [extractedFilters.practice.value];
    }

    if (extractedFilters.startDate?.value) {
      runtimeFilters.startDate = extractedFilters.startDate.value;
    }

    if (extractedFilters.endDate?.value) {
      runtimeFilters.endDate = extractedFilters.endDate.value;
    }

    // Advanced filters
    if (
      Array.isArray(extractedFilters.advancedFilters) &&
      extractedFilters.advancedFilters.length > 0
    ) {
      runtimeFilters.advancedFilters = extractedFilters.advancedFilters;
    }

    // Universal filters override chart-level filters
    if (universalFilters.startDate) {
      runtimeFilters.startDate = universalFilters.startDate;
    }

    if (universalFilters.endDate) {
      runtimeFilters.endDate = universalFilters.endDate;
    }

    // SECURITY-CRITICAL: Only pass through practice_uids if they exist and have values
    // Empty arrays should NOT be passed (no filter applied = query all practices)
    // This is a fail-closed security measure to prevent data leakage
    if (
      universalFilters.practiceUids &&
      universalFilters.practiceUids.length > 0
    ) {
      runtimeFilters.practiceUids = universalFilters.practiceUids;
    }

    return runtimeFilters;
  }

  /**
   * Extract metadata for result tracking
   *
   * Extracts metadata fields that are useful for debugging and monitoring:
   * - measure (from data source filters)
   * - frequency (from data source filters)
   * - groupBy (from chart config)
   *
   * @param extractedFilters - Filters extracted from data_source
   * @param chart - Chart definition
   * @returns Metadata object
   */
  extractMetadata(
    extractedFilters: ExtractedFilters,
    chart: ChartDefinition
  ): Record<string, string> {
    const metadata: Record<string, string> = {};

    if (extractedFilters.measure?.value) {
      metadata.measure = String(extractedFilters.measure.value);
    }

    if (extractedFilters.frequency?.value) {
      metadata.frequency = String(extractedFilters.frequency.value);
    }

    const chartConfigTyped = chart.chart_config as {
      groupBy?: string;
      series?: { groupBy?: string };
    };

    const groupBy = chartConfigTyped.groupBy || chartConfigTyped.series?.groupBy;
    if (groupBy) {
      metadata.groupBy = groupBy;
    }

    return metadata;
  }
}
