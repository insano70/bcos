/**
 * Chart Click Handler Utility
 *
 * Creates Chart.js onClick handlers that extract click context
 * for drill-down functionality.
 *
 * Single Responsibility: Extract click context from Chart.js events
 *
 * @module lib/utils/chart-click-handler
 */

import type { Chart, ChartEvent, ActiveElement } from 'chart.js';
import type { ChartClickContext } from '@/lib/types/drill-down';

/**
 * Parameters for creating click handler
 */
export interface ChartClickHandlerParams {
  /** Callback when a chart element is clicked */
  onElementClick: (context: ChartClickContext) => void;
  /** Field name for the primary dimension (groupBy field or 'date') */
  primaryField?: string;
  /** Field name for series dimension in multi-series charts (e.g., 'provider_name') */
  seriesField?: string;
}

/**
 * Create a Chart.js onClick handler that extracts click context
 * 
 * For multi-series charts, both primaryField and seriesField should be provided:
 * - primaryField: The x-axis dimension (e.g., 'date', 'month')
 * - seriesField: The series grouping field (e.g., 'provider_name', 'location')
 *
 * @param params - Handler parameters
 * @returns Chart.js compatible onClick function
 */
export function createChartClickHandler(
  params: ChartClickHandlerParams
): (event: ChartEvent, elements: ActiveElement[], chart: Chart) => void {
  const { onElementClick, primaryField = 'date', seriesField } = params;

  return (event: ChartEvent, elements: ActiveElement[], chart: Chart) => {
    // Only handle clicks on actual chart elements
    if (!elements || elements.length === 0) {
      return;
    }

    // Get the first clicked element
    const element = elements[0];
    if (!element) {
      return;
    }

    const dataIndex = element.index;
    const datasetIndex = element.datasetIndex;

    // Get the label (x-axis value) for this data point
    const labels = chart.data.labels;
    if (!labels || labels.length <= dataIndex) {
      return;
    }

    const label = labels[dataIndex];

    // Get dataset info
    const datasets = chart.data.datasets;
    if (!datasets || datasets.length <= datasetIndex) {
      return;
    }

    const dataset = datasets[datasetIndex];
    const datasetLabel = dataset?.label;

    // Extract click position from native event
    const nativeEvent = event.native as MouseEvent | undefined;
    if (!nativeEvent) {
      return;
    }

    // Build click context with multi-series support
    const context: ChartClickContext = {
      fieldName: primaryField,
      fieldValue: String(label),
      clickPosition: {
        x: nativeEvent.clientX,
        y: nativeEvent.clientY,
      },
      dataIndex,
      datasetIndex,
      // Include datasetLabel if it has a value (exactOptionalPropertyTypes compliance)
      ...(datasetLabel ? { datasetLabel } : {}),
      // Include series field info for multi-series charts
      ...(seriesField && datasetLabel ? {
        seriesFieldName: seriesField,
        seriesFieldValue: datasetLabel,
      } : {}),
    };

    onElementClick(context);
  };
}

/**
 * Determine the primary field name from chart configuration
 *
 * @param chartConfig - Chart configuration object
 * @returns Field name to use for click context
 */
export function getPrimaryFieldFromConfig(chartConfig: {
  groupBy?: string;
  x_axis?: { field?: string };
} | null | undefined): string {
  if (!chartConfig) {
    return 'date';
  }

  // Check for explicit groupBy field
  if (chartConfig.groupBy && chartConfig.groupBy !== 'none') {
    return chartConfig.groupBy;
  }

  // Check x_axis field
  if (chartConfig.x_axis?.field) {
    return chartConfig.x_axis.field;
  }

  // Default to date for time series charts
  return 'date';
}

/**
 * Chart configuration shape for series field extraction
 */
interface ChartConfigForSeries {
  seriesConfigs?: Array<{ groupBy?: string }>;
  series?: { groupBy?: string };
  multipleSeries?: boolean;
  groupBy?: string;
}

/**
 * Get the series field name from chart configuration
 * 
 * Multi-series charts can be configured in several ways:
 * 1. seriesConfigs[].groupBy - Multiple series configuration
 * 2. series.groupBy - Single series grouping
 * 
 * @param chartConfig - Chart configuration object
 * @returns The series field name, or undefined if not a multi-series chart
 */
export function getSeriesFieldFromConfig(
  chartConfig: ChartConfigForSeries | null | undefined
): string | undefined {
  if (!chartConfig) {
    return undefined;
  }

  // Check seriesConfigs array (multiple series)
  if (chartConfig.seriesConfigs && Array.isArray(chartConfig.seriesConfigs)) {
    const firstSeries = chartConfig.seriesConfigs[0];
    if (firstSeries?.groupBy && firstSeries.groupBy !== 'none') {
      return firstSeries.groupBy;
    }
  }

  // Check series.groupBy (single series grouping)
  if (chartConfig.series?.groupBy && chartConfig.series.groupBy !== 'none') {
    return chartConfig.series.groupBy;
  }

  return undefined;
}

/**
 * Extract dataset-level field from multi-series charts
 *
 * For charts with multiple series (e.g., grouped by provider),
 * the dataset label often represents a second dimension value.
 *
 * @param datasetLabel - Label from the clicked dataset
 * @param config - Chart configuration
 * @returns Field name and value, or null if not applicable
 */
export function extractDatasetField(
  datasetLabel: string | undefined,
  config: ChartConfigForSeries | null | undefined
): { field: string; value: string } | null {
  if (!datasetLabel) {
    return null;
  }

  const seriesField = getSeriesFieldFromConfig(config);
  if (seriesField) {
    return {
      field: seriesField,
      value: datasetLabel,
    };
  }

  return null;
}

