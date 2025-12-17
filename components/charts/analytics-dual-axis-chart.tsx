'use client';

import type { ChartConfiguration, ChartData as ChartJSData } from 'chart.js';
import {
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import { chartColors } from '@/components/charts/chartjs-config';
import type { ChartData, DualAxisConfig } from '@/lib/types/analytics';
import type { ResponsiveChartProps } from '@/lib/types/responsive-charts';
import { formatValue, formatValueCompact } from '@/lib/utils/chart-data/formatters/value-formatter';
import { getMeasureTypeFromChart } from '@/lib/utils/type-guards';

// Register Chart.js components
Chart.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface AnalyticsDualAxisChartProps extends ResponsiveChartProps {
  dualAxisConfig: DualAxisConfig; // Required since checked before passing
  chartData: ChartData; // Chart data passed from parent
  width?: number | undefined;
  height?: number | undefined;
  title?: string | undefined;
}

export default function AnalyticsDualAxisChart({
  dualAxisConfig,
  chartData,
  width: _width = 800,
  height = 400,
  title,
  // Responsive props
  responsive = false,
  minHeight: _minHeight = 200,
  maxHeight: _maxHeight = 800,
  aspectRatio: _aspectRatio,
}: AnalyticsDualAxisChartProps) {
  const [chart, setChart] = useState<Chart | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  const darkMode = theme === 'dark';
  const { textColor, gridColor, tooltipBodyColor, tooltipBgColor, tooltipBorderColor } =
    chartColors;

  // Create and update chart with Chart.js - deferred to prevent race condition
  useEffect(() => {
    if (!canvas.current?.parentElement || !canvas.current.isConnected || !chartData || chartData.datasets.length === 0) {
      return;
    }

    const canvasElement = canvas.current;
    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;

    // Destroy existing chart before creating new one
    if (chart && canvasElement) {
      chart.destroy();
      setChart(null);
    }

    // Also check if there's an existing chart on this canvas using Chart.js registry
    const existingChart = Chart.getChart(canvasElement);
    if (existingChart) {
      existingChart.destroy();
    }

    // Track whether cleanup has been called (to prevent creating chart after unmount)
    let isCancelled = false;
    let newChart: Chart | null = null;

    // Defer initialization until after React's layout phase (fixes race condition)
    // Single RAF is sufficient - canvas should be ready after first frame
    const rafId = requestAnimationFrame(() => {
      // Re-check connection after deferral (component may have unmounted)
      if (isCancelled || !canvasElement.isConnected) {
        return;
      }

      // Create chart configuration
      const config: ChartConfiguration = {
        type: 'bar',
        data: chartData as ChartJSData<'bar'>,
        options: {
          layout: {
            padding: 0,
          },
          scales: {
            x: {
              display: true,
              grid: {
                display: false,
              },
              ticks: {
                color: darkMode ? textColor.dark : textColor.light,
                font: {
                  size: 11,
                },
                maxRotation: 45,
                minRotation: 0,
              },
            },
            'y-left': {
              type: 'linear',
              position: 'left',
              display: true,
              title: {
                display: !!dualAxisConfig?.primary.axisLabel,
                text: dualAxisConfig?.primary.axisLabel || '',
                color: darkMode ? textColor.dark : textColor.light,
                font: {
                  size: 12,
                  weight: 'bold',
                },
              },
              grid: {
                color: darkMode ? gridColor.dark : gridColor.light,
              },
              ticks: {
                color: darkMode ? textColor.dark : textColor.light,
                font: {
                  size: 11,
                },
                callback: (tickValue: string | number) => {
                  const value = Number(tickValue);
                  const primaryMeasureType = chartData.datasets[0]?.measureType;
                  return formatValueCompact(value, primaryMeasureType || 'number');
                },
              },
            },
            'y-right': {
              type: 'linear',
              position: 'right',
              display: true,
              title: {
                display: !!dualAxisConfig?.secondary.axisLabel,
                text: dualAxisConfig?.secondary.axisLabel || '',
                color: darkMode ? textColor.dark : textColor.light,
                font: {
                  size: 12,
                  weight: 'bold',
                },
              },
              grid: {
                drawOnChartArea: false, // Only show grid for left y-axis
              },
              ticks: {
                color: darkMode ? textColor.dark : textColor.light,
                font: {
                  size: 11,
                },
                callback: (tickValue: string | number) => {
                  const value = Number(tickValue);
                  const secondaryMeasureType = chartData.datasets[1]?.measureType;
                  return formatValueCompact(value, secondaryMeasureType || 'number');
                },
              },
            },
          },
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: {
                usePointStyle: true,
                padding: 15,
                color: darkMode ? textColor.dark : textColor.light,
                font: {
                  size: 12,
                },
              },
            },
            title: {
              display: !!title,
              text: title || '',
              color: darkMode ? textColor.dark : textColor.light,
              font: {
                size: 16,
                weight: 'bold',
              },
              padding: {
                top: 10,
                bottom: 20,
              },
            },
            tooltip: {
              backgroundColor: darkMode ? tooltipBgColor.dark : tooltipBgColor.light,
              titleColor: darkMode ? tooltipBodyColor.dark : tooltipBodyColor.light,
              bodyColor: darkMode ? tooltipBodyColor.dark : tooltipBodyColor.light,
              borderColor: darkMode ? tooltipBorderColor.dark : tooltipBorderColor.light,
              borderWidth: 1,
              padding: 12,
              displayColors: true,
              callbacks: {
                label: (context) => {
                  const label = context.dataset.label || '';
                  const value = context.parsed.y ?? 0;
                  const measureType = getMeasureTypeFromChart(context.dataset, 'number');
                  const formattedValue = formatValue(value, measureType);
                  return `${label}: ${formattedValue}`;
                },
              },
            },
          },
          interaction: {
            mode: 'index',
            intersect: false,
          },
          responsive: false, // Disable Chart.js responsive mode (we handle it manually)
          maintainAspectRatio: false,
        },
      };

      newChart = new Chart(ctx, config);
      setChart(newChart);
    });

    // Cleanup function
    return () => {
      isCancelled = true;
      cancelAnimationFrame(rafId);
      if (newChart) {
        newChart.destroy();
      }
    };
  }, [chartData, darkMode, theme, title, dualAxisConfig]);

  // Manual responsive handling (same pattern as bar chart - fixes container sizing)
  useEffect(() => {
    if (!chart || !canvas.current?.isConnected) return;

    // Observe parent container for size changes
    const container = canvas.current.parentElement;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      // Defer resize to next frame for safety
      requestAnimationFrame(() => {
        if (chart && canvas.current?.isConnected) {
          chart.resize();
        }
      });
    });

    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [chart]);

  if (chartData.datasets.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-8"
        style={responsive ? { width: '100%', height: '100%' } : { height }}
      >
        <p className="text-gray-500 dark:text-gray-400">No data available</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-1 min-h-0">
        <canvas
          ref={canvas}
          width={_width}
          height={height}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
          }}
        ></canvas>
      </div>
    </div>
  );
}
