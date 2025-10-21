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
import { formatValue as formatChartValue } from '@/lib/utils/chart-data/formatters/value-formatter';

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

  // Chart initialization - deferred to prevent race condition with React 19 concurrent rendering
  useEffect(() => {
    const ctx = canvas.current;
    
    // Safety check: ensure canvas is properly mounted
    if (!ctx?.parentElement || !ctx.isConnected) return;

    // Defer initialization until after React's layout phase (fixes race condition)
    const rafId = requestAnimationFrame(() => {
      // Double RAF ensures we're after paint
      requestAnimationFrame(() => {
        // Re-check connection after deferral
        if (!ctx.isConnected) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[LineChart01] Canvas disconnected during initialization deferral');
          }
          return;
        }

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
                    // Get measure type from dataset metadata, fallback to chart data, then to 'number'
                    const measureType =
                      (context.dataset as { measureType?: string })?.measureType ||
                      (context.chart.data as { measureType?: string })?.measureType ||
                      'number';
                    const value = context.parsed.y ?? 0;
                    const formattedValue = formatChartValue(value, measureType);
                    return `${context.dataset.label}: ${formattedValue}`;
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
            responsive: false, // Disable Chart.js responsive mode (we handle it manually below)
            resizeDelay: 200,
          },
        });
        setChart(newChart);
      });
    });

    return () => {
      // Clean up animation frame if component unmounts during deferral
      cancelAnimationFrame(rafId);
      if (chart) {
        chart.destroy();
      }
    };
  }, []); // Initialize once

  // Update data when it changes (without recreating chart)
  useEffect(() => {
    if (!chart || !canvas.current?.isConnected) return;

    chart.data = data;
    chart.update('none');
  }, [chart, data]);

  useEffect(() => {
    if (!chart || !canvas.current) return;

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

  // Manual responsive handling (replaces Chart.js responsive mode - preserves responsive design!)
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

  // Handle explicit width/height prop changes
  useEffect(() => {
    if (!chart || !canvas.current?.isConnected) return;

    chart.resize();
  }, [chart, width, height]);

  return (
    <canvas 
      ref={canvas} 
      width={width}
      height={height}
      className="chart-canvas"
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
});

export default LineChart01;
