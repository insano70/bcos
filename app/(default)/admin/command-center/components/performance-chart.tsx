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
import type { Chart as ChartType, ChartConfiguration } from 'chart.js';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import 'chartjs-adapter-moment';
import { chartColors } from '@/components/charts/chartjs-config';
import { apiClient } from '@/lib/api/client';
import type { PerformanceHistoryResponse } from '@/lib/monitoring/types';
import { Spinner } from '@/components/ui/spinner';

const BRAND_COLOR = '#00AEEF'; // violet-500

// Register Chart.js components (zoom plugin registered dynamically below)
Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend
);

// Dynamically import zoom plugin to avoid SSR issues with 'window'
let zoomPluginRegistered = false;
async function ensureZoomPlugin() {
  if (typeof window !== 'undefined' && !zoomPluginRegistered) {
    const zoomPlugin = (await import('chartjs-plugin-zoom')).default;
    Chart.register(zoomPlugin);
    zoomPluginRegistered = true;
  }
}

interface PerformanceChartProps {
  category: 'standard' | 'analytics';
  timeRange: string;
  height?: number;
}

export default function PerformanceChart({
  category,
  timeRange,
  height = 300,
}: PerformanceChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [chart, setChart] = useState<ChartType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { theme } = useTheme();
  const darkMode = theme === 'dark';

  const handleResetZoom = () => {
    if (chart) {
      chart.resetZoom();
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: Chart instance should not trigger re-fetches - only timeRange, category, and darkMode changes
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Ensure zoom plugin is loaded before creating chart
        await ensureZoomPlugin();

        const response = await apiClient.get(
          `/api/admin/monitoring/performance-history?timeRange=${timeRange}&category=${category}`
        );
        const data = response as PerformanceHistoryResponse;

        const labels = data.dataPoints.map((dp) => dp.timestamp);
        const p50Data = data.dataPoints.map((dp) => dp.responseTime.p50);
        const p95Data = data.dataPoints.map((dp) => dp.responseTime.p95);
        const p99Data = data.dataPoints.map((dp) => dp.responseTime.p99);

        const chartData = {
          labels,
          datasets: [
            {
              label: 'p50 (median)',
              data: p50Data,
              borderColor: BRAND_COLOR,
              backgroundColor: `${BRAND_COLOR}20`,
              borderWidth: 2,
              tension: 0.4,
              pointRadius: 2,
              pointHoverRadius: 4,
            },
            {
              label: 'p95',
              data: p95Data,
              borderColor: '#8B5CF6',
              backgroundColor: 'rgba(139, 92, 246, 0.1)',
              borderWidth: 2,
              tension: 0.4,
              pointRadius: 2,
              pointHoverRadius: 4,
            },
            {
              label: 'p99',
              data: p99Data,
              borderColor: '#F59E0B',
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              borderWidth: 2,
              tension: 0.4,
              pointRadius: 2,
              pointHoverRadius: 4,
            },
          ],
        };

        if (chart) {
          chart.data = chartData;

          // Update colors for current theme
          if (chart.options.scales?.x?.ticks) {
            chart.options.scales.x.ticks.color = darkMode
              ? chartColors.textColor.dark
              : chartColors.textColor.light;
          }
          if (chart.options.scales?.y?.ticks) {
            chart.options.scales.y.ticks.color = darkMode
              ? chartColors.textColor.dark
              : chartColors.textColor.light;
          }
          if (chart.options.scales?.y?.grid) {
            chart.options.scales.y.grid.color = darkMode
              ? chartColors.gridColor.dark
              : chartColors.gridColor.light;
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

          chart.update();
        } else if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            const config: ChartConfiguration = {
              type: 'line',
              data: chartData,
              options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
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
                  y: {
                    beginAtZero: true,
                    title: {
                      display: true,
                      text: 'Response Time (ms)',
                      color: darkMode ? chartColors.textColor.dark : chartColors.textColor.light,
                    },
                    grid: {
                      color: darkMode ? chartColors.gridColor.dark : chartColors.gridColor.light,
                    },
                    ticks: {
                      color: darkMode ? chartColors.textColor.dark : chartColors.textColor.light,
                    },
                  },
                },
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

        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load performance data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    return () => {
      if (chart) {
        chart.destroy();
      }
    };
  }, [timeRange, category, darkMode]);

  // Separate effect for theme changes
  useEffect(() => {
    if (!chart) return;

    // Update all colors when theme changes
    if (chart.options.scales?.x?.ticks) {
      chart.options.scales.x.ticks.color = darkMode
        ? chartColors.textColor.dark
        : chartColors.textColor.light;
    }
    if (chart.options.scales?.y?.ticks) {
      chart.options.scales.y.ticks.color = darkMode
        ? chartColors.textColor.dark
        : chartColors.textColor.light;
    }
    if (chart.options.scales?.y?.grid) {
      chart.options.scales.y.grid.color = darkMode
        ? chartColors.gridColor.dark
        : chartColors.gridColor.light;
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

    chart.update('none'); // Update without animation
  }, [chart, darkMode]);

  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 flex flex-col"
      style={{ height: `${height}px` }}
    >
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          {category === 'standard' ? 'API' : 'Analytics'} Response Times
        </h3>
        <button
          type="button"
          onClick={handleResetZoom}
          className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
          title="Reset zoom"
        >
          Reset Zoom
        </button>
      </div>
      {loading && (
        <div className="flex items-center justify-center flex-1">
          <Spinner size="md" />
        </div>
      )}
      {error && <div className="text-center text-red-600 py-8 flex-1">{error}</div>}
      {!loading && !error && (
        <div className="flex-1 relative">
          <canvas ref={canvasRef} className="absolute inset-0" />
        </div>
      )}
    </div>
  );
}
