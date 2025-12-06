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
import { useEffect, useRef, useState } from 'react';
import { chartColors } from '@/components/charts/chartjs-config';
import 'chartjs-adapter-moment';
import { formatValue } from '@/components/utils/utils';

Chart.register(LineController, LineElement, Filler, PointElement, LinearScale, TimeScale, Tooltip);

interface AreaChartProps {
  data: ChartData;
  width: number;
  height: number;
}

export default function AreaChart({ data, width, height }: AreaChartProps) {
  const [chart, setChart] = useState<Chart | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  const darkMode = theme === 'dark';
  const { textColor, gridColor, tooltipBodyColor, tooltipBgColor, tooltipBorderColor } =
    chartColors;

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
            console.warn('[AreaChart] Canvas disconnected during initialization deferral');
          }
          return;
        }

        const newChart = new Chart(ctx, {
          type: 'line',
          data: {
            ...data,
            datasets: data.datasets.map((dataset) => ({
              ...dataset,
              fill: true, // Enable area fill
              tension: 0.4, // Smooth curves
            })),
          },
          options: {
            layout: {
              padding: 20,
            },
            scales: {
              y: {
                beginAtZero: true,
                border: {
                  display: false,
                },
                ticks: {
                  maxTicksLimit: 5,
                  callback: (value) => formatValue(+value),
                  color: darkMode ? textColor.dark : textColor.light,
                },
                grid: {
                  color: darkMode ? gridColor.dark : gridColor.light,
                },
              },
              x: {
                type: 'time',
                time: {
                  parser: 'MM-DD-YYYY',
                  unit: 'month',
                  displayFormats: {
                    month: 'MMM YY',
                  },
                },
                border: {
                  display: false,
                },
                grid: {
                  display: false,
                },
                ticks: {
                  color: darkMode ? textColor.dark : textColor.light,
                },
              },
            },
            plugins: {
              tooltip: {
                callbacks: {
                  title: () => '',
                  label: (context) => `${context.dataset.label}: ${formatValue(context.parsed.y ?? 0)}`,
                },
                bodyColor: darkMode ? tooltipBodyColor.dark : tooltipBodyColor.light,
                backgroundColor: darkMode ? tooltipBgColor.dark : tooltipBgColor.light,
                borderColor: darkMode ? tooltipBorderColor.dark : tooltipBorderColor.light,
              },
              legend: {
                display: true,
                position: 'top',
                labels: {
                  usePointStyle: true,
                  color: darkMode ? textColor.dark : textColor.light,
                },
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

    chart.data = {
      ...data,
      datasets: data.datasets.map((dataset) => ({
        ...dataset,
        fill: true,
        tension: 0.4,
      })),
    };
    chart.update('none');
  }, [chart, data]);

  useEffect(() => {
    if (!chart || !canvas.current) return;

    // Update theme colors
    if (darkMode) {
      chart.options.scales!.x!.ticks!.color = textColor.dark;
      chart.options.scales!.y!.ticks!.color = textColor.dark;
      chart.options.scales!.y!.grid!.color = gridColor.dark;
      chart.options.plugins!.tooltip!.bodyColor = tooltipBodyColor.dark;
      chart.options.plugins!.tooltip!.backgroundColor = tooltipBgColor.dark;
      chart.options.plugins!.tooltip!.borderColor = tooltipBorderColor.dark;
      chart.options.plugins!.legend!.labels!.color = textColor.dark;
    } else {
      chart.options.scales!.x!.ticks!.color = textColor.light;
      chart.options.scales!.y!.ticks!.color = textColor.light;
      chart.options.scales!.y!.grid!.color = gridColor.light;
      chart.options.plugins!.tooltip!.bodyColor = tooltipBodyColor.light;
      chart.options.plugins!.tooltip!.backgroundColor = tooltipBgColor.light;
      chart.options.plugins!.tooltip!.borderColor = tooltipBorderColor.light;
      chart.options.plugins!.legend!.labels!.color = textColor.light;
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
      style={{ width: '100%', height: '100%', display: 'block', touchAction: 'manipulation' }}
    />
  );
}
