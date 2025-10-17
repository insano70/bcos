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
import zoomPlugin from 'chartjs-plugin-zoom';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import 'chartjs-adapter-moment';
import type { Chart as ChartType } from 'chart.js';
import { chartColors } from '@/components/charts/chartjs-config';
import { apiClient } from '@/lib/api/client';
import type { PerformanceHistoryResponse } from '@/lib/monitoring/types';

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

interface ErrorRateChartProps {
  category: 'standard' | 'analytics';
  timeRange: string;
  height?: number;
}

export default function ErrorRateChart({ category, timeRange, height = 300 }: ErrorRateChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<ChartType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { theme } = useTheme();
  const darkMode = theme === 'dark';

  const handleResetZoom = () => {
    if (chartRef.current) {
      chartRef.current.resetZoom();
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await apiClient.get(
          `/api/admin/monitoring/performance-history?timeRange=${timeRange}&category=${category}`
        );
        const data = response as PerformanceHistoryResponse;

        const labels = data.dataPoints.map((dp) => dp.timestamp);
        const errorRates = data.dataPoints.map((dp) => dp.errorRate);
        const errorCounts = data.dataPoints.map((dp) => dp.errorCount);

        const chartData = {
          labels,
          datasets: [
            {
              label: 'Error Rate (%)',
              data: errorRates,
              borderColor: '#EF4444',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              borderWidth: 2,
              tension: 0.4,
              pointRadius: 2,
              pointHoverRadius: 4,
              yAxisID: 'y',
            },
            {
              label: 'Error Count',
              data: errorCounts,
              borderColor: '#F59E0B',
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              borderWidth: 2,
              tension: 0.4,
              pointRadius: 2,
              pointHoverRadius: 4,
              yAxisID: 'y1',
            },
          ],
        };

        if (chartRef.current) {
          chartRef.current.data = chartData;

          // Update colors for current theme
          const chart = chartRef.current;
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
          if (chart.options.scales?.y1?.ticks) {
            chart.options.scales.y1.ticks.color = darkMode
              ? chartColors.textColor.dark
              : chartColors.textColor.light;
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

          chartRef.current.update();
        } else if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            chartRef.current = new Chart(ctx, {
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
                    type: 'linear',
                    display: true,
                    position: 'left',
                    beginAtZero: true,
                    title: {
                      display: true,
                      text: 'Error Rate (%)',
                      color: darkMode ? chartColors.textColor.dark : chartColors.textColor.light,
                    },
                    grid: {
                      color: darkMode ? chartColors.gridColor.dark : chartColors.gridColor.light,
                    },
                    ticks: {
                      color: darkMode ? chartColors.textColor.dark : chartColors.textColor.light,
                    },
                  },
                  y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    beginAtZero: true,
                    title: {
                      display: true,
                      text: 'Error Count',
                      color: darkMode ? chartColors.textColor.dark : chartColors.textColor.light,
                    },
                    grid: { display: false },
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
            });
          }
        }

        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load error rate data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [timeRange, category, darkMode]);

  // Separate effect for theme changes
  useEffect(() => {
    if (!chartRef.current) return;

    const chart = chartRef.current;

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
    if (chart.options.scales?.y1?.ticks) {
      chart.options.scales.y1.ticks.color = darkMode
        ? chartColors.textColor.dark
        : chartColors.textColor.light;
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
  }, [darkMode]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6" style={{ height }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
          Error Rate Trending
        </h3>
        <button
          onClick={handleResetZoom}
          className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
          title="Reset zoom"
        >
          Reset Zoom
        </button>
      </div>
      {loading && (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
        </div>
      )}
      {error && <div className="text-center text-red-600 py-8">{error}</div>}
      {!loading && !error && <canvas ref={canvasRef} />}
    </div>
  );
}
