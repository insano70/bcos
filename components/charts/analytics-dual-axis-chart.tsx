'use client';

import { useState, useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { Chart, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend } from 'chart.js';
import type { ChartData as ChartJSData, ChartConfiguration } from 'chart.js';
import { ChartData, type DualAxisConfig } from '@/lib/types/analytics';
import type { ResponsiveChartProps } from '@/lib/types/responsive-charts';
import { chartColors } from '@/components/charts/chartjs-config';
import { simplifiedChartTransformer } from '@/lib/utils/simplified-chart-transformer';

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
  width = 800,
  height = 400,
  title,
  // Responsive props
  responsive = false,
  minHeight = 200,
  maxHeight = 800,
  aspectRatio
}: AnalyticsDualAxisChartProps) {
  const [chart, setChart] = useState<Chart | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  const darkMode = theme === 'dark';
  const { textColor, gridColor, tooltipBodyColor, tooltipBgColor, tooltipBorderColor } = chartColors;


  // Create and update chart with Chart.js
  useEffect(() => {
    if (!canvas.current || !chartData || chartData.datasets.length === 0) {
      return;
    }

    const ctx = canvas.current.getContext('2d');
    if (!ctx) return;

    // Destroy existing chart before creating new one
    if (chart) {
      chart.destroy();
      setChart(null);
    }

    // Also check if there's an existing chart on this canvas using Chart.js registry
    const existingChart = Chart.getChart(canvas.current);
    if (existingChart) {
      existingChart.destroy();
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
              callback: function(tickValue: string | number) {
                const value = Number(tickValue);
                const primaryMeasureType = chartData.datasets[0]?.measureType;
                return simplifiedChartTransformer.formatValueCompact(value, primaryMeasureType || 'number');
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
              callback: function(tickValue: string | number) {
                const value = Number(tickValue);
                const secondaryMeasureType = chartData.datasets[1]?.measureType;
                return simplifiedChartTransformer.formatValueCompact(value, secondaryMeasureType || 'number');
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
              label: function(context) {
                const label = context.dataset.label || '';
                const value = context.parsed.y;
                const measureType = (context.dataset as unknown as { measureType?: string }).measureType;
                const formattedValue = simplifiedChartTransformer.formatValue(value, measureType || 'number');
                return `${label}: ${formattedValue}`;
              },
            },
          },
        },
        interaction: {
          mode: 'index',
          intersect: false,
        },
        responsive: true,
        maintainAspectRatio: false,
      },
    };

    const newChart = new Chart(ctx, config);
    setChart(newChart);

    // Cleanup function
    return () => {
      if (newChart) {
        newChart.destroy();
      }
    };
  }, [chartData, darkMode, theme, title, dualAxisConfig]);

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
    <div className="w-full h-full">
      <canvas
        ref={canvas}
        style={{
          width: '100%',
          height: '100%',
          display: 'block'
        }}
      ></canvas>
    </div>
  );
}
