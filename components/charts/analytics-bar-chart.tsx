'use client';

import { useRef, useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { chartColors } from '@/components/charts/chartjs-config';
import {
  Chart,
  BarController,
  BarElement,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend,
} from 'chart.js';
import type { ChartData } from 'chart.js';
import 'chartjs-adapter-moment';
import { formatValue } from '@/components/utils/utils';

Chart.register(BarController, BarElement, LinearScale, TimeScale, Tooltip, Legend);

interface AnalyticsBarChartProps {
  data: ChartData;
  width: number;
  height: number;
  frequency?: string; // For time axis configuration
}

export default function AnalyticsBarChart({ data, width, height, frequency = 'Monthly' }: AnalyticsBarChartProps) {
  const [chart, setChart] = useState<Chart | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const legend = useRef<HTMLUListElement>(null);
  const { theme } = useTheme();
  const darkMode = theme === 'dark';
  const { textColor, gridColor, tooltipBodyColor, tooltipBgColor, tooltipBorderColor } = chartColors;

  // Configure time display formats based on frequency
  const getTimeConfig = () => {
    switch (frequency) {
      case 'Weekly':
        return {
          unit: 'week',
          displayFormats: {
            week: 'DD-MMM-YY', // "20-JUL-25"
          },
          tooltipFormat: 'DD-MMM-YYYY'
        };
      case 'Monthly':
        return {
          unit: 'month',
          displayFormats: {
            month: 'MMM YYYY', // "Jul 2025"
          },
          tooltipFormat: 'MMM YYYY'
        };
      case 'Quarterly':
        return {
          unit: 'quarter',
          displayFormats: {
            quarter: '[Q]Q YYYY', // "Q3 2025"
          },
          tooltipFormat: '[Q]Q YYYY'
        };
      default:
        return {
          unit: 'month',
          displayFormats: {
            month: 'MMM YYYY',
          },
          tooltipFormat: 'MMM YYYY'
        };
    }
  };

  useEffect(() => {
    const ctx = canvas.current;
    if (!ctx) return;

    const timeConfig = getTimeConfig();

    const newChart = new Chart(ctx, {
      type: 'bar',
      data: data,
      options: {
        layout: {
          padding: {
            top: 12,
            bottom: 16,
            left: 20,
            right: 20,
          },
        },
        scales: {
          y: {
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
              unit: timeConfig.unit as any,
              displayFormats: timeConfig.displayFormats,
              tooltipFormat: timeConfig.tooltipFormat,
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
          legend: {
            display: false, // We'll use custom legend with totals
          },
          tooltip: {
            callbacks: {
              title: (context) => {
                // Format tooltip title based on frequency
                const date = new Date(context[0].label);
                return date.toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: frequency === 'Weekly' ? 'numeric' : undefined
                });
              },
              label: (context) => `${context.dataset.label}: ${formatValue(context.parsed.y)}`,
            },
            bodyColor: darkMode ? tooltipBodyColor.dark : tooltipBodyColor.light,
            backgroundColor: darkMode ? tooltipBgColor.dark : tooltipBgColor.light,
            borderColor: darkMode ? tooltipBorderColor.dark : tooltipBorderColor.light,
          },
        },
        interaction: {
          intersect: false,
          mode: 'nearest',
        },
        animation: {
          duration: 500,
        },
        maintainAspectRatio: false,
        resizeDelay: 200,
      },
      plugins: [
        {
          id: 'htmlLegend',
          afterUpdate(c, args, options) {
            const ul = legend.current;
            if (!ul) return;
            // Remove old legend items
            while (ul.firstChild) {
              ul.firstChild.remove();
            }
            // Reuse the built-in legendItems generator
            const items = c.options.plugins?.legend?.labels?.generateLabels?.(c);
            items?.forEach((item) => {
              const li = document.createElement('li');
              // Button element
              const button = document.createElement('button');
              button.style.display = 'inline-flex';
              button.style.alignItems = 'center';
              button.style.opacity = item.hidden ? '.3' : '';
              button.onclick = () => {
                c.setDatasetVisibility(item.datasetIndex!, !c.isDatasetVisible(item.datasetIndex!));
                c.update();
              };
              // Color box
              const box = document.createElement('span');
              box.style.display = 'block';
              box.style.width = '12px';
              box.style.height = '12px';
              box.style.borderRadius = 'calc(infinity * 1px)';
              box.style.marginRight = '8px';
              box.style.borderWidth = '3px';
              box.style.borderColor = item.fillStyle as string;
              box.style.pointerEvents = 'none';
              // Label
              const labelContainer = document.createElement('span');
              labelContainer.style.display = 'flex';
              labelContainer.style.alignItems = 'center';
              const value = document.createElement('span');
              value.classList.add('text-gray-800', 'dark:text-gray-100');
              value.style.fontSize = '30px';
              value.style.lineHeight = 'calc(2.25 / 1.875)';
              value.style.fontWeight = '700';
              value.style.marginRight = '8px';
              value.style.pointerEvents = 'none';
              const label = document.createElement('span');
              label.classList.add('text-gray-500', 'dark:text-gray-400');
              label.style.fontSize = '14px';
              label.style.lineHeight = 'calc(1.25 / 0.875)';
              // Calculate total for this dataset
              const dataset = c.data.datasets[item.datasetIndex!];
              const dataArray = dataset.data;
              
              console.log('🔍 LEGEND CALCULATION:', {
                providerName: item.text,
                datasetIndex: item.datasetIndex,
                dataArray: dataArray,
                dataArrayLength: dataArray.length,
                sampleValues: dataArray.slice(0, 3)
              });
              
              const theValue: number = dataArray.reduce(
                (a, b) => (typeof a === 'number' ? a : 0) + (typeof b === 'number' ? b : 0),
                0
              );
              
              console.log('🔍 CALCULATED TOTAL:', {
                providerName: item.text,
                calculatedTotal: theValue
              });
              const valueText = document.createTextNode(formatValue(theValue));
              const labelText = document.createTextNode(item.text);
              value.appendChild(valueText);
              label.appendChild(labelText);
              li.appendChild(button);
              button.appendChild(box);
              button.appendChild(labelContainer);
              labelContainer.appendChild(value);
              labelContainer.appendChild(label);
              ul.appendChild(li);
            });
          },
        },
      ],
    });

    setChart(newChart);
    return () => newChart.destroy();
  }, [frequency]);

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
      if (chart.options.plugins!.legend!.labels) {
        chart.options.plugins!.legend!.labels.color = textColor.dark;
      }
    } else {
      chart.options.scales!.x!.ticks!.color = textColor.light;
      chart.options.scales!.y!.ticks!.color = textColor.light;
      chart.options.scales!.y!.grid!.color = gridColor.light;
      chart.options.plugins!.tooltip!.bodyColor = tooltipBodyColor.light;
      chart.options.plugins!.tooltip!.backgroundColor = tooltipBgColor.light;
      chart.options.plugins!.tooltip!.borderColor = tooltipBorderColor.light;
      if (chart.options.plugins!.legend!.labels) {
        chart.options.plugins!.legend!.labels.color = textColor.light;
      }
    }
    chart.update('none');
  }, [theme]);

  return (
    <>
      <div className="px-5 py-3">
        <ul ref={legend} className="flex flex-wrap gap-x-4"></ul>
      </div>
      <div className="grow">
        <canvas ref={canvas} width={width} height={height}></canvas>
      </div>
    </>
  );
}
