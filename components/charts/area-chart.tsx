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
  const { textColor, gridColor, tooltipBodyColor, tooltipBgColor, tooltipBorderColor } = chartColors;

  useEffect(() => {
    const ctx = canvas.current;
    if (!ctx) return;

    const newChart = new Chart(ctx, {
      type: 'line',
      data: {
        ...data,
        datasets: data.datasets.map(dataset => ({
          ...dataset,
          fill: true, // Enable area fill
          tension: 0.4, // Smooth curves
        }))
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
              label: (context) => `${context.dataset.label}: ${formatValue(context.parsed.y)}`,
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
        resizeDelay: 200,
      },
    });

    setChart(newChart);
    return () => newChart.destroy();
  }, []);

  useEffect(() => {
    if (!chart) return;

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

  return <canvas ref={canvas} width={width} height={height}></canvas>;
}
