/**
 * Base Time Series Chart Component
 *
 * Shared chart component for Command Center time series visualizations.
 * Extracted from duplicate code in performance-chart.tsx and error-rate-chart.tsx.
 *
 * Features:
 * - Chart.js with time scale and zoom plugin
 * - Theme-aware colors (dark/light mode)
 * - Reset zoom functionality
 * - Loading and error states
 */

'use client';

import {
  Chart,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  TimeScale,
  Tooltip,
} from 'chart.js';
import type { ChartConfiguration, ChartDataset, ChartData } from 'chart.js';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import 'chartjs-adapter-moment';
import { chartColors } from '@/components/charts/chartjs-config';

// Track if Chart.js has been initialized with all plugins
let chartInitialized = false;

interface DatasetConfig {
  label: string;
  data: number[];
  borderColor: string;
  backgroundColor: string;
  yAxisID?: string;
}

interface YAxisConfig {
  id: string;
  position: 'left' | 'right';
  title: string;
  beginAtZero?: boolean;
  showGrid?: boolean;
}

interface BaseTimeSeriesChartProps {
  title: string;
  labels: string[];
  datasets: DatasetConfig[];
  yAxes?: YAxisConfig[];
  height?: number;
  loading?: boolean;
  error?: string | null;
}

export default function BaseTimeSeriesChart({
  title,
  labels,
  datasets,
  yAxes = [{ id: 'y', position: 'left', title: 'Value', beginAtZero: true, showGrid: true }],
  height = 300,
  loading = false,
  error = null,
}: BaseTimeSeriesChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [chart, setChart] = useState<Chart<'line'> | null>(null);
  const [isReady, setIsReady] = useState(false);
  const { theme } = useTheme();
  const darkMode = theme === 'dark';

  // Initialize Chart.js with zoom plugin on client side only
  useEffect(() => {
    const initChart = async () => {
      if (!chartInitialized && typeof window !== 'undefined') {
        // Dynamically import zoom plugin to avoid SSR issues with hammerjs
        const zoomPlugin = (await import('chartjs-plugin-zoom')).default;
        Chart.register(
          LineController,
          LineElement,
          PointElement,
          LinearScale,
          TimeScale,
          Tooltip,
          Legend,
          zoomPlugin
        );
        chartInitialized = true;
      }
      setIsReady(true);
    };
    initChart();
  }, []);

  const handleResetZoom = () => {
    if (chart) {
      chart.resetZoom();
    }
  };

  // Build chart data and update on changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: Chart instance should not trigger re-fetches - only data/theme changes
  useEffect(() => {
    if (!isReady || loading || error || !canvasRef.current) return;

    const chartData: ChartData<'line'> = {
      labels,
      datasets: datasets.map((ds) => ({
        label: ds.label,
        data: ds.data,
        borderColor: ds.borderColor,
        backgroundColor: ds.backgroundColor,
        borderWidth: 2,
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 4,
        yAxisID: ds.yAxisID || 'y',
      })) as ChartDataset<'line'>[],
    };

    if (chart) {
      chart.data = chartData as ChartData<'line'>;
      updateChartTheme(chart, darkMode);
      chart.update();
    } else {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        const scales: Record<string, object> = {
          x: {
            type: 'time',
            time: {
              unit: 'minute',
              displayFormats: { minute: 'HH:mm' },
            },
            grid: { display: false },
            ticks: {
              color: darkMode ? chartColors.textColor.dark : chartColors.textColor.light,
            },
          },
        };

        // Build y-axes from config
        for (const axis of yAxes) {
          scales[axis.id] = {
            type: 'linear',
            display: true,
            position: axis.position,
            beginAtZero: axis.beginAtZero ?? true,
            title: {
              display: true,
              text: axis.title,
              color: darkMode ? chartColors.textColor.dark : chartColors.textColor.light,
            },
            grid: {
              display: axis.showGrid ?? axis.position === 'left',
              color: darkMode ? chartColors.gridColor.dark : chartColors.gridColor.light,
            },
            ticks: {
              color: darkMode ? chartColors.textColor.dark : chartColors.textColor.light,
            },
          };
        }

        const config: ChartConfiguration<'line'> = {
          type: 'line',
          data: chartData,
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales,
            plugins: {
              legend: {
                display: true,
                position: 'top',
                labels: {
                  color: darkMode ? chartColors.textColor.dark : chartColors.textColor.light,
                },
              },
              tooltip: {
                backgroundColor: darkMode
                  ? chartColors.tooltipBgColor.dark
                  : chartColors.tooltipBgColor.light,
                titleColor: darkMode
                  ? chartColors.tooltipTitleColor.dark
                  : chartColors.tooltipTitleColor.light,
                bodyColor: darkMode
                  ? chartColors.tooltipBodyColor.dark
                  : chartColors.tooltipBodyColor.light,
                borderColor: darkMode
                  ? chartColors.tooltipBorderColor.dark
                  : chartColors.tooltipBorderColor.light,
                borderWidth: 1,
              },
              zoom: {
                pan: {
                  enabled: true,
                  mode: 'x',
                },
                zoom: {
                  wheel: {
                    enabled: true,
                  },
                  pinch: {
                    enabled: true,
                  },
                  mode: 'x',
                },
              },
            },
          },
        };
        const newChart = new Chart(ctx, config);
        setChart(newChart);
      }
    }

    return () => {
      if (chart) {
        chart.destroy();
      }
    };
  }, [labels, datasets, loading, error, darkMode, isReady]);

  // Theme change effect
  useEffect(() => {
    if (chart) {
      updateChartTheme(chart, darkMode);
      chart.update('none');
    }
  }, [chart, darkMode]);

  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 flex flex-col"
      style={{ height: `${height}px` }}
    >
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
        <button
          type="button"
          onClick={handleResetZoom}
          className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
          title="Reset zoom"
        >
          Reset Zoom
        </button>
      </div>
      {(loading || !isReady) && (
        <div className="flex items-center justify-center flex-1">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
        </div>
      )}
      {error && <div className="text-center text-red-600 py-8 flex-1">{error}</div>}
      {!loading && !error && isReady && (
        <div className="flex-1 relative">
          <canvas ref={canvasRef} className="absolute inset-0" />
        </div>
      )}
    </div>
  );
}

/**
 * Update chart theme colors
 */
function updateChartTheme(chart: Chart<'line'>, darkMode: boolean): void {
  if (chart.options.scales?.x?.ticks) {
    chart.options.scales.x.ticks.color = darkMode
      ? chartColors.textColor.dark
      : chartColors.textColor.light;
  }

  // Update all y-axes
  for (const key of Object.keys(chart.options.scales || {})) {
    if (key.startsWith('y')) {
      const scale = chart.options.scales?.[key] as {
        ticks?: { color?: string };
        grid?: { color?: string };
        title?: { color?: string };
      } | undefined;
      if (scale?.ticks) {
        scale.ticks.color = darkMode ? chartColors.textColor.dark : chartColors.textColor.light;
      }
      if (scale?.grid) {
        scale.grid.color = darkMode ? chartColors.gridColor.dark : chartColors.gridColor.light;
      }
      if (scale?.title) {
        scale.title.color = darkMode ? chartColors.textColor.dark : chartColors.textColor.light;
      }
    }
  }

  if (chart.options.plugins?.legend?.labels) {
    chart.options.plugins.legend.labels.color = darkMode
      ? chartColors.textColor.dark
      : chartColors.textColor.light;
  }
  if (chart.options.plugins?.tooltip) {
    chart.options.plugins.tooltip.backgroundColor = darkMode
      ? chartColors.tooltipBgColor.dark
      : chartColors.tooltipBgColor.light;
    chart.options.plugins.tooltip.titleColor = darkMode
      ? chartColors.tooltipTitleColor.dark
      : chartColors.tooltipTitleColor.light;
    chart.options.plugins.tooltip.bodyColor = darkMode
      ? chartColors.tooltipBodyColor.dark
      : chartColors.tooltipBodyColor.light;
    chart.options.plugins.tooltip.borderColor = darkMode
      ? chartColors.tooltipBorderColor.dark
      : chartColors.tooltipBorderColor.light;
  }
}
