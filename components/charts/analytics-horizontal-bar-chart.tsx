'use client';

import type { TooltipItem } from 'chart.js';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js';
import { useTheme } from 'next-themes';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { chartColors } from '@/components/charts/chartjs-config';
import type { ChartData } from '@/lib/types/analytics';
import { formatValue } from '@/lib/utils/chart-data/formatters/value-formatter';
import { createPeriodComparisonHorizontalTooltipCallbacks } from '@/lib/utils/period-comparison-tooltips';

Chart.register(BarController, BarElement, LinearScale, CategoryScale, Tooltip, Legend);

interface AnalyticsHorizontalBarChartProps {
  data: ChartData;
  width: number;
  height: number;
}

const AnalyticsHorizontalBarChart = forwardRef<HTMLCanvasElement, AnalyticsHorizontalBarChartProps>(
  function AnalyticsHorizontalBarChart({ data, width, height }, ref) {
    const [chart, setChart] = useState<Chart | null>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const legend = useRef<HTMLUListElement>(null);

    // Expose canvas element to parent via ref
    useImperativeHandle(ref, () => canvas.current!, []);
    const { theme } = useTheme();
    const darkMode = theme === 'dark';
    const { textColor, gridColor, tooltipBodyColor, tooltipBgColor, tooltipBorderColor } =
      chartColors;

    useEffect(() => {
      const ctx = canvas.current;
      // Ensure canvas is mounted and has a parent element before creating chart
      if (!ctx || !ctx.parentElement) return;

      const newChart = new Chart(ctx, {
        type: 'bar',
        data: data,
        options: {
          indexAxis: 'y', // This makes the bars horizontal
          layout: {
            padding: {
              top: 12,
              bottom: 16,
              left: 20,
              right: 20,
            },
          },
          scales: {
            x: {
              // X-axis shows numeric values (horizontal)
              border: {
                display: false,
              },
              ticks: {
                maxTicksLimit: 5,
                callback: (value) => {
                  // Get measure type from chart data, fallback to 'number'
                  const measureType = data.measureType || 'number';
                  return formatValue(+value, measureType);
                },
                color: darkMode ? textColor.dark : textColor.light,
              },
              grid: {
                color: darkMode ? gridColor.dark : gridColor.light,
              },
            },
            y: {
              // Y-axis shows category labels (vertical)
              type: 'category',
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
              callbacks: (() => {
                // Check if this is a period comparison chart
                const hasPeriodComparison = data.datasets.some(
                  (dataset) =>
                    dataset.label?.includes('Previous') ||
                    dataset.label?.includes('Last Year') ||
                    dataset.label?.includes('Ago')
                );

                if (hasPeriodComparison) {
                  return createPeriodComparisonHorizontalTooltipCallbacks(darkMode);
                }

                // Default tooltip callbacks
                return {
                  title: (tooltipItems: TooltipItem<'bar'>[]) => {
                    // Show the category label as title
                    return tooltipItems[0]?.label || '';
                  },
                  label: (tooltipItem: TooltipItem<'bar'>) => {
                    // Get measure type from dataset metadata, fallback to chart data, then to 'number'
                    const measureType =
                      (tooltipItem.dataset as { measureType?: string })?.measureType ||
                      (tooltipItem.chart.data as { measureType?: string })?.measureType ||
                      'number';
                    const formattedValue = formatValue(tooltipItem.parsed.x, measureType);
                    return `${tooltipItem.dataset.label}: ${formattedValue}`;
                  },
                };
              })(),
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
          responsive: true,
          resizeDelay: 200,
        },
        plugins: [
          {
            id: 'htmlLegend',
            afterUpdate(c, _args, _options) {
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
                button.style.minWidth = '0'; // Allow shrinking
                button.style.maxWidth = '200px'; // Limit button width
                button.style.margin = '2px'; // Compact spacing
                button.onclick = () => {
                  c.setDatasetVisibility(
                    item.datasetIndex!,
                    !c.isDatasetVisible(item.datasetIndex!)
                  );
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
                value.style.fontSize = '18px';
                value.style.lineHeight = '1.4';
                value.style.fontWeight = '600';
                value.style.marginRight = '6px';
                value.style.pointerEvents = 'none';
                const label = document.createElement('span');
                label.classList.add('text-gray-500', 'dark:text-gray-400');
                label.style.fontSize = '12px';
                label.style.lineHeight = '1.3';
                label.style.whiteSpace = 'nowrap';
                label.style.overflow = 'hidden';
                label.style.textOverflow = 'ellipsis';
                label.style.maxWidth = '120px'; // Limit label width
                // Calculate total for this dataset
                const dataset = c.data.datasets[item.datasetIndex!];
                const dataArray = dataset?.data || [];

                const theValue: number = dataArray.reduce((sum: number, value) => {
                  // Handle Chart.js data types safely
                  if (typeof value === 'number') {
                    return sum + value;
                  } else if (value && typeof value === 'object' && 'x' in value) {
                    // Handle Point objects (note: using 'x' for horizontal bars)
                    return sum + (typeof value.x === 'number' ? value.x : 0);
                  }
                  return sum;
                }, 0) as number;

                // Get measure type from chart data, fallback to 'number'
                const measureType = data.measureType || 'number';
                const valueText = document.createTextNode(formatValue(theValue, measureType));
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
      return () => {
        try {
          newChart.destroy();
        } catch (error) {
          // Ignore errors during cleanup
          console.warn('Chart cleanup warning:', error);
        }
      };
    }, [data]);

    useEffect(() => {
      if (!chart) return;

      // Update theme colors
      if (darkMode) {
        chart.options.scales!.x!.ticks!.color = textColor.dark;
        chart.options.scales!.y!.ticks!.color = textColor.dark;
        chart.options.scales!.x!.grid!.color = gridColor.dark;
        chart.options.plugins!.tooltip!.bodyColor = tooltipBodyColor.dark;
        chart.options.plugins!.tooltip!.backgroundColor = tooltipBgColor.dark;
        chart.options.plugins!.tooltip!.borderColor = tooltipBorderColor.dark;
        if (chart.options.plugins!.legend!.labels) {
          chart.options.plugins!.legend!.labels.color = textColor.dark;
        }
      } else {
        chart.options.scales!.x!.ticks!.color = textColor.light;
        chart.options.scales!.y!.ticks!.color = textColor.light;
        chart.options.scales!.x!.grid!.color = gridColor.light;
        chart.options.plugins!.tooltip!.bodyColor = tooltipBodyColor.light;
        chart.options.plugins!.tooltip!.backgroundColor = tooltipBgColor.light;
        chart.options.plugins!.tooltip!.borderColor = tooltipBorderColor.light;
        if (chart.options.plugins!.legend!.labels) {
          chart.options.plugins!.legend!.labels.color = textColor.light;
        }
      }
      chart.update('none');
    }, [theme]);

    // Handle dimension changes for responsive behavior
    useEffect(() => {
      if (!chart || !canvas.current || !canvas.current.parentElement) return;

      // Let Chart.js handle responsive sizing automatically
      try {
        chart.resize();
      } catch (error) {
        // Ignore resize errors if chart is being unmounted
        console.warn('Chart resize warning:', error);
      }
    }, [chart, width, height]);

    return (
      <div className="w-full h-full flex flex-col">
        <div className="px-3 py-2 flex-shrink-0 overflow-hidden">
          <ul
            ref={legend}
            className="flex flex-wrap gap-x-2 gap-y-1"
            style={{
              maxHeight: '80px', // Limit legend height
              overflowY: 'auto',
              overflowX: 'hidden',
            }}
          ></ul>
        </div>
        <div className="flex-1 min-h-0">
          <canvas
            ref={canvas}
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
            }}
          />
        </div>
      </div>
    );
  }
);

export default AnalyticsHorizontalBarChart;
