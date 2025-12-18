import type { Chart } from 'chart.js';

/**
 * Check if a Chart.js chart instance is safe to update.
 * Verifies the chart exists and has valid canvas/context.
 *
 * Use this before any chart.update() or chart.resize() call to prevent
 * errors when the chart has been destroyed or the canvas disconnected.
 *
 * @param chart - The Chart.js chart instance to check
 * @returns True if the chart can be safely updated
 *
 * @example
 * ```ts
 * if (!isChartSafeToUpdate(chartRef.current)) return;
 * chartRef.current.update('none');
 * ```
 */
export function isChartSafeToUpdate<T extends Chart>(chart: T | null): chart is T {
  if (!chart) return false;
  try {
    // Check if canvas and context are still valid
    return !!(chart.canvas && chart.ctx);
  } catch {
    return false;
  }
}
