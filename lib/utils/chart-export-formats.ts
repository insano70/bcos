/**
 * Chart Export Format Utilities
 *
 * Determines which export formats are available for each chart type.
 * Used to conditionally show/hide export options in ChartHeader.
 *
 * CANVAS-BASED EXPORT:
 * PNG and PDF exports require a canvas element. Only chart types that
 * use Chart.js with forwardRef support canvas export.
 *
 * CSV EXPORT:
 * All chart types support CSV export since it uses raw data, not canvas.
 */

/**
 * Export format type
 */
export type ExportFormat = 'png' | 'pdf' | 'csv';

/**
 * Chart types that support canvas-based export (PNG/PDF)
 *
 * These chart types use Chart.js and properly forward the canvas ref
 * via forwardRef + useImperativeHandle.
 */
const CANVAS_EXPORT_CHART_TYPES = new Set([
  'bar',
  'stacked-bar',
  'horizontal-bar',
  'line',
  'doughnut',
  'pie',
]);

/**
 * Chart types that support CSV export
 *
 * Most chart types support CSV since it exports raw data.
 * Table charts are excluded since they already show tabular data.
 */
const CSV_EXPORT_CHART_TYPES = new Set([
  'bar',
  'stacked-bar',
  'horizontal-bar',
  'line',
  'doughnut',
  'pie',
  'area',
  'number',
  'progress-bar',
  'dual-axis',
  // 'table' - excluded, already shows tabular data
]);

/**
 * Get available export formats for a chart type
 *
 * @param chartType - The chart type (e.g., 'bar', 'line', 'number')
 * @returns Array of available export formats
 *
 * @example
 * getAvailableExportFormats('bar') // ['png', 'pdf', 'csv']
 * getAvailableExportFormats('number') // ['csv']
 * getAvailableExportFormats('table') // []
 */
export function getAvailableExportFormats(chartType: string): ExportFormat[] {
  const formats: ExportFormat[] = [];

  // Check canvas-based exports (PNG/PDF)
  if (CANVAS_EXPORT_CHART_TYPES.has(chartType)) {
    formats.push('png', 'pdf');
  }

  // Check CSV export
  if (CSV_EXPORT_CHART_TYPES.has(chartType)) {
    formats.push('csv');
  }

  return formats;
}

/**
 * Check if a chart type supports any export format
 *
 * @param chartType - The chart type
 * @returns true if any export format is available
 */
export function hasAnyExportFormat(chartType: string): boolean {
  return getAvailableExportFormats(chartType).length > 0;
}

/**
 * Check if a chart type supports canvas-based export (PNG/PDF)
 *
 * @param chartType - The chart type
 * @returns true if PNG/PDF export is available
 */
export function supportsCanvasExport(chartType: string): boolean {
  return CANVAS_EXPORT_CHART_TYPES.has(chartType);
}

/**
 * Check if a chart type supports CSV export
 *
 * @param chartType - The chart type
 * @returns true if CSV export is available
 */
export function supportsCsvExport(chartType: string): boolean {
  return CSV_EXPORT_CHART_TYPES.has(chartType);
}






