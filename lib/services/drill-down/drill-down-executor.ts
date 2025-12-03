/**
 * Drill-Down Executor Service
 *
 * Pure logic service that executes drill-down actions based on click context
 * and chart configuration. No database access - purely transforms inputs to outputs.
 *
 * @module lib/services/drill-down/drill-down-executor
 */

import type {
  ChartClickContext,
  DrillDownConfig,
  DrillDownFilter,
  DrillDownResult,
} from '@/lib/types/drill-down';

/**
 * Check if a value looks like a formatted date label
 * These are display-only values that won't match raw data
 * Examples: "Oct 2025", "Jan 2024", "Q1 2025", "2025-W01"
 */
function isFormattedDateLabel(value: string | number): boolean {
  if (typeof value !== 'string') return false;
  
  // Month abbreviation patterns: "Oct 2025", "January 2025"
  const monthPattern = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]?\s+\d{4}$/i;
  
  // Quarter patterns: "Q1 2025"
  const quarterPattern = /^Q[1-4]\s+\d{4}$/i;
  
  // Week patterns: "2025-W01", "Week 1 2025"
  const weekPattern = /^(\d{4}-W\d{1,2}|Week\s+\d{1,2}\s+\d{4})$/i;
  
  return monthPattern.test(value) || quarterPattern.test(value) || weekPattern.test(value);
}

/**
 * Build filters array from click context
 * 
 * For multi-series charts, this returns both primary and series filters.
 * For single-series charts, only the primary filter is returned.
 * 
 * Note: Formatted date labels (like "Oct 2025") are skipped because they
 * won't match raw data values. For multi-series charts, the series filter
 * (e.g., provider_name) is the meaningful drill-down dimension.
 * 
 * @param context - Click context from chart element
 * @returns Array of filters to apply
 */
function buildFiltersFromContext(context: ChartClickContext): DrillDownFilter[] {
  const filters: DrillDownFilter[] = [];

  // For multi-series charts with a series filter, the series dimension
  // is the primary drill-down target. Skip formatted date labels.
  const hasSeriesFilter = context.seriesFieldName && context.seriesFieldValue;
  const isPrimaryFormattedDate = isFormattedDateLabel(context.fieldValue);
  
  // Add primary field filter unless it's a formatted date with series available
  if (!isPrimaryFormattedDate || !hasSeriesFilter) {
    filters.push({
      field: context.fieldName,
      value: context.fieldValue,
    });
  }

  // Add series filter for multi-series charts
  if (context.seriesFieldName && context.seriesFieldValue) {
    filters.push({
      field: context.seriesFieldName,
      value: context.seriesFieldValue,
    });
  }

  return filters;
}

/**
 * Execute a drill-down action based on click context and chart configuration.
 * 
 * Supports multi-series charts by building an array of filters from both
 * the primary dimension (x-axis) and series dimension (dataset).
 *
 * @param config - Drill-down configuration from chart definition
 * @param context - Click context captured from chart element click
 * @returns DrillDownResult describing the action to take, or null if invalid
 */
export function executeDrillDown(
  config: DrillDownConfig,
  context: ChartClickContext
): DrillDownResult | null {
  // Validate inputs
  if (!config.enabled || !config.type) {
    return null;
  }

  // Validate click context
  if (!context.fieldName || context.fieldValue === undefined) {
    return null;
  }

  // Build filters from context (supports multi-series)
  const filters = buildFiltersFromContext(context);

  switch (config.type) {
    case 'filter':
      // Filter: Apply filter(s) to current chart
      return {
        type: 'filter',
        filters,
      };

    case 'navigate':
      // Navigate: Open target chart in modal with filter(s) applied
      if (!config.targetChartId) {
        return null;
      }
      return {
        type: 'navigate',
        targetChartId: config.targetChartId,
        targetFilters: filters,
      };

    case 'swap':
      // Swap: Replace current chart with target chart (no filter)
      if (!config.targetChartId) {
        return null;
      }
      return {
        type: 'swap',
        targetChartId: config.targetChartId,
      };

    default:
      // Unknown type
      return null;
  }
}

/**
 * Build a DrillDownConfig from chart definition fields.
 * Used to transform database row data into typed config.
 *
 * @param chartDef - Partial chart definition with drill-down fields
 * @returns DrillDownConfig suitable for use with executeDrillDown
 */
export function buildDrillDownConfig(chartDef: {
  drill_down_enabled?: boolean | null;
  drill_down_type?: string | null;
  drill_down_target_chart_id?: string | null;
  drill_down_button_label?: string | null;
}): DrillDownConfig {
  const rawType = chartDef.drill_down_type;
  const type = (rawType as 'filter' | 'navigate' | 'swap' | null | undefined) ?? null;

  return {
    enabled: chartDef.drill_down_enabled ?? false,
    type: type,
    targetChartId: chartDef.drill_down_target_chart_id ?? null,
    buttonLabel: chartDef.drill_down_button_label ?? 'Drill Down',
  };
}

/**
 * Validate that a drill-down configuration is internally consistent.
 *
 * @param config - Drill-down configuration to validate
 * @returns Error message if invalid, null if valid
 */
export function validateDrillDownConfig(config: DrillDownConfig): string | null {
  if (!config.enabled) {
    // Disabled config is always valid
    return null;
  }

  if (!config.type) {
    return 'Drill-down type is required when enabled';
  }

  const validTypes = ['filter', 'navigate', 'swap'];
  if (!validTypes.includes(config.type)) {
    return `Invalid drill-down type: ${config.type}`;
  }

  // Navigate and swap require a target chart
  if ((config.type === 'navigate' || config.type === 'swap') && !config.targetChartId) {
    return `Target chart is required for ${config.type} drill-down type`;
  }

  return null;
}

