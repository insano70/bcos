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

  // TODO: Register additional handlers in future phases
  // - DistributionChartHandler (pie, doughnut)
  // - TableChartHandler (table)
  // - MetricChartHandler (number, progress-bar)
  // - ComboChartHandler (dual-axis)

  const registeredTypes = chartTypeRegistry.getAllTypes();

  log.info('Chart type handlers registered successfully', {
    count: registeredTypes.length,
    types: registeredTypes,
  });
}

// Auto-register on module import
registerAllHandlers();

// Export handlers for direct use if needed
export { TimeSeriesChartHandler, BarChartHandler };

// Re-export registry for convenience
export { chartTypeRegistry };
