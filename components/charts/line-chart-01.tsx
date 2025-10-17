'use client';

import type { ChartData } from 'chart.js';
import {
  Chart,
  Filler,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  TimeScale,
  Tooltip,
} from 'chart.js';
import { useTheme } from 'next-themes';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { chartColors } from '@/components/charts/chartjs-config';
import 'chartjs-adapter-moment';

// Import utilities
import { formatValue } from '@/components/utils/utils';

Chart.register(LineController, LineElement, Filler, PointElement, LinearScale, TimeScale, Tooltip);

interface LineChart01Props {
  data: ChartData;
  width: number;
  height: number;
}

const LineChart01 = forwardRef<HTMLCanvasElement, LineChart01Props>(function LineChart01(
  { data, width, height },
  ref
) {
  const [chart, setChart] = useState<Chart | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  // Expose canvas element to parent via ref
  useImperativeHandle(ref, () => canvas.current!, []);
  const { theme } = useTheme();
  const darkMode = theme === 'dark';
  const { textColor, tooltipBodyColor, tooltipBgColor, tooltipBorderColor } = chartColors;

  useEffect(() => {
    const ctx = canvas.current;
    if (!ctx) return;

    const newChart = new Chart(ctx, {
      type: 'line',
      data: data,
      options: {
        layout: {
          padding: {
            left: 40,
            right: 40,
            top: 20,
            bottom: 20,
          },
        },
        scales: {
          y: {
            display: false,
            beginAtZero: true,
          },
          x: {
            type: 'time',
            time: {
              // parser: false, // Let Chart.js handle Date objects directly
              unit: 'week', // Use week unit for better weekly data handling
              displayFormats: {
                week: 'MMM DD',
                month: 'MMM YY',
              },
            },
            display: true,
            border: {
              display: false,
            },
            grid: {
              display: false,
            },
            ticks: {
              color: darkMode ? textColor.dark : textColor.light,
              maxTicksLimit: 10, // Allow up to 10 ticks for weekly data
              autoSkip: false, // Don't skip any labels
              includeBounds: true, // Include first and last ticks
              source: 'data', // Use data points as tick sources
              callback: function (value, _index, _ticks) {
                // Custom formatting for quarterly data
                const date = new Date(this.getLabelForValue(Number(value)));
                const quarter = Math.floor(date.getMonth() / 3) + 1;
                const year = date.getFullYear();

                // Check if this looks like quarterly data (March, June, September, December)
                const month = date.getMonth();
                if (month === 2 || month === 5 || month === 8 || month === 11) {
                  // Mar, Jun, Sep, Dec
                  return `Q${quarter} ${year}`;
                }

                // For other data, use default formatting
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              },
            },
          },
        },
        plugins: {
          tooltip: {
            callbacks: {
              title: (context) => {
                // Show the date as the title
                const date = new Date(context[0]?.label || '');
                return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
              },
              label: (context) => {
                // Show provider name and value
                return `${context.dataset.label}: ${formatValue(context.parsed.y)}`;
              },
            },
            bodyColor: darkMode ? tooltipBodyColor.dark : tooltipBodyColor.light,
            backgroundColor: darkMode ? tooltipBgColor.dark : tooltipBgColor.light,
            borderColor: darkMode ? tooltipBorderColor.dark : tooltipBorderColor.light,
          },
          legend: {
            display: false,
          },
        },
        interaction: {
          intersect: false,
          mode: 'nearest',
        },
        maintainAspectRatio: false,
        responsive: true,
        resizeDelay: 200,
      },
    });
    setChart(newChart);
    return () => newChart.destroy();
  }, []);

  useEffect(() => {
    if (!chart) return;

    if (darkMode) {
      chart.options.plugins!.tooltip!.bodyColor = tooltipBodyColor.dark;
      chart.options.plugins!.tooltip!.backgroundColor = tooltipBgColor.dark;
      chart.options.plugins!.tooltip!.borderColor = tooltipBorderColor.dark;
    } else {
      chart.options.plugins!.tooltip!.bodyColor = tooltipBodyColor.light;
      chart.options.plugins!.tooltip!.backgroundColor = tooltipBgColor.light;
      chart.options.plugins!.tooltip!.borderColor = tooltipBorderColor.light;
    }
    chart.update('none');
  }, [theme]);

  // Handle dimension changes for responsive behavior
  useEffect(() => {
    if (!chart || !canvas.current) return;

    // Let Chart.js handle responsive sizing automatically
    chart.resize();
  }, [chart, width, height]);

  return <canvas ref={canvas} className="chart-canvas" />;
});

export default LineChart01;
