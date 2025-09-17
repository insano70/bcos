'use client';

import { useRef, useState, useEffect } from 'react';
import { useTheme } from 'next-themes';

import { chartColors } from '@/components/charts/chartjs-config';
import {
  Chart,
  LineController,
  LineElement,
  Filler,
  PointElement,
  LinearScale,
  TimeScale,
  Tooltip,
} from 'chart.js';
import type { ChartData } from 'chart.js';
import 'chartjs-adapter-moment';

// Import utilities
import { formatValue } from '@/components/utils/utils';

Chart.register(LineController, LineElement, Filler, PointElement, LinearScale, TimeScale, Tooltip);

interface LineChart01Props {
  data: ChartData;
  width: number;
  height: number;
}

export default function LineChart01({ data, width, height }: LineChart01Props) {
  const [chart, setChart] = useState<Chart | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
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
              parser: false, // Let Chart.js handle Date objects directly
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
              callback: function(value, index, ticks) {
                // Custom formatting for quarterly data
                const date = new Date(this.getLabelForValue(value));
                const quarter = Math.floor(date.getMonth() / 3) + 1;
                const year = date.getFullYear();
                
                // Check if this looks like quarterly data (March, June, September, December)
                const month = date.getMonth();
                if (month === 2 || month === 5 || month === 8 || month === 11) { // Mar, Jun, Sep, Dec
                  return `Q${quarter} ${year}`;
                }
                
                // For other data, use default formatting
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              }
            },
          },
        },
        plugins: {
          tooltip: {
            callbacks: {
              title: (context) => {
                // Show the date as the title
                const date = new Date(context[0].label);
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

  return <canvas ref={canvas} width={width} height={height}></canvas>;
}
