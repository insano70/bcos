/**
 * Chart Handlers Index
 *
 * Central registration point for all chart type handlers.
 * Handlers are automatically registered with the chart type registry on import.
 *
 * Usage:
 * Import this file in your application startup to register all handlers:
 * import '@/lib/services/chart-handlers';
 */

import { chartTypeRegistry } from '../chart-type-registry';
import { TimeSeriesChartHandler } from './time-series-handler';
import { BarChartHandler } from './bar-chart-handler';
import { DistributionChartHandler } from './distribution-handler';
import { TableChartHandler } from './table-handler';
import { MetricChartHandler } from './metric-handler';
import { ProgressBarChartHandler } from './progress-bar-handler';
import { ComboChartHandler } from './combo-handler';
import { log } from '@/lib/logger';

/**
 * Register all chart type handlers
 * Called automatically on module import
 */
function registerAllHandlers(): void {
  log.info('Registering chart type handlers');

  // Register time series handler (handles line and area)
  const timeSeriesHandler = new TimeSeriesChartHandler();
  chartTypeRegistry.register(timeSeriesHandler);

  // Register bar chart handler (handles bar, stacked-bar, horizontal-bar)
  const barChartHandler = new BarChartHandler();
  chartTypeRegistry.register(barChartHandler);

  // Register distribution handler (handles pie and doughnut)
  const distributionHandler = new DistributionChartHandler();
  chartTypeRegistry.register(distributionHandler);

  // Register table handler (handles table)
  const tableHandler = new TableChartHandler();
  chartTypeRegistry.register(tableHandler);

  // Register metric handler (handles number charts only)
  const metricHandler = new MetricChartHandler();
  chartTypeRegistry.register(metricHandler);

  // Register progress bar handler (handles grouped progress-bar charts)
  const progressBarHandler = new ProgressBarChartHandler();
  chartTypeRegistry.register(progressBarHandler);

  // Register combo handler (handles dual-axis)
  const comboHandler = new ComboChartHandler();
  chartTypeRegistry.register(comboHandler);

  const registeredTypes = chartTypeRegistry.getAllTypes();

  log.info('Chart type handlers registered successfully', {
    count: registeredTypes.length,
    types: registeredTypes,
  });
}

// Auto-register on module import
registerAllHandlers();

// Export handlers for direct use if needed
export {
  TimeSeriesChartHandler,
  BarChartHandler,
  DistributionChartHandler,
  TableChartHandler,
  MetricChartHandler,
  ProgressBarChartHandler,
  ComboChartHandler,
};

// Re-export registry for convenience
export { chartTypeRegistry };
