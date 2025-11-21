/**
 * useChartInstance Hook
 *
 * Manages Chart.js instance lifecycle:
 * - Plugin registration (one-time)
 * - Chart initialization with configuration
 * - Chart destruction on cleanup
 * - Zoom reset functionality
 *
 * Single Responsibility: Chart.js instance management
 */

import { useEffect, useState, useCallback, type RefObject } from 'react';
import type { Chart as ChartType, ChartOptions } from 'chart.js';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  TimeScale,
  Tooltip,
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import type { ChartData } from '@/lib/types/analytics';
import type { FullscreenChartType } from '@/lib/utils/chart-fullscreen-config';

// Track plugin registration globally
let pluginsRegistered = false;

/**
 * Register Chart.js plugins (one-time operation)
 */
function registerChartPlugins() {
  if (!pluginsRegistered) {
    Chart.register(
      BarController,
      BarElement,
      LineController,
      LineElement,
      PointElement,
      Filler,
      LinearScale,
      CategoryScale,
      TimeScale,
      Tooltip,
      Legend,
      zoomPlugin
    );
    pluginsRegistered = true;
  }
}

/**
 * Parameters for useChartInstance hook
 */
interface UseChartInstanceParams {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  chartData: ChartData;
  chartType: FullscreenChartType;
  chartOptions: ChartOptions;
  isOpen: boolean;
  expandedData: unknown | null;
  mounted: boolean;
}

/**
 * Return value from useChartInstance hook
 */
export interface ChartInstanceState {
  chart: ChartType | null;
  resetZoom: () => void;
}

/**
 * Manages Chart.js instance lifecycle and interactions
 *
 * @param params - Hook parameters
 * @returns Chart instance and control functions
 */
export function useChartInstance(params: UseChartInstanceParams): ChartInstanceState {
  const { canvasRef, chartData, chartType, chartOptions, isOpen, expandedData, mounted } = params;

  const [chart, setChart] = useState<ChartType | null>(null);

  // Register Chart.js plugins once
  useEffect(() => {
    registerChartPlugins();
  }, []);

  // Initialize chart
  // biome-ignore lint/correctness/useExhaustiveDependencies: canvasRef.current is intentionally excluded - ref mutations don't trigger re-renders, mounted state ensures canvas is ready
  useEffect(() => {
    // Don't initialize if modal is closed, not mounted, canvas isn't ready, no data, or showing expanded data
    if (!mounted || !isOpen || !canvasRef.current || !chartData || expandedData) {
      return;
    }

    const ctx = canvasRef.current;

    // Convert our ChartData to Chart.js ChartData format
    const chartjsData = {
      labels: chartData.labels,
      datasets: chartData.datasets,
    };

    // Determine actual Chart.js chart type
    const actualChartType = chartType === 'line' ? 'line' : 'bar';

    // Create new chart instance
    const newChart = new Chart(ctx, {
      type: actualChartType,
      data: chartjsData,
      options: chartOptions,
    });

    setChart(newChart);

    // Cleanup on unmount or dependencies change
    return () => {
      newChart.destroy();
      setChart(null);
    };
  }, [mounted, isOpen, chartData, chartType, chartOptions, expandedData]);

  /**
   * Reset chart zoom to original view
   */
  const resetZoom = useCallback(() => {
    if (chart) {
      chart.resetZoom();
    }
  }, [chart]);

  return {
    chart,
    resetZoom,
  };
}
