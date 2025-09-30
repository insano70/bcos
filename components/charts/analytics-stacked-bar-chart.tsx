'use client';

import { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useTheme } from 'next-themes';
import { chartColors } from '@/components/charts/chartjs-config';
import {
  Chart,
  BarController,
  BarElement,
  LinearScale,
  CategoryScale,
  TimeScale,
  Tooltip,
  Legend,
} from 'chart.js';
import type { ChartData } from 'chart.js';
import 'chartjs-adapter-moment';
import { formatValue } from '@/components/utils/utils';
import { simplifiedChartTransformer } from '@/lib/utils/simplified-chart-transformer';

Chart.register(BarController, BarElement, LinearScale, CategoryScale, TimeScale, Tooltip, Legend);

interface AnalyticsStackedBarChartProps {
  data: ChartData;
  width: number;
  height: number;
  frequency?: string; // For time axis configuration
  stackingMode?: 'normal' | 'percentage'; // Stacking mode
}

const AnalyticsStackedBarChart = forwardRef<HTMLCanvasElement, AnalyticsStackedBarChartProps>(function AnalyticsStackedBarChart({ data, width, height, frequency = 'Monthly', stackingMode = 'normal' }, ref) {
  const [chart, setChart] = useState<Chart | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const legend = useRef<HTMLUListElement>(null);
  
  // Expose canvas element to parent via ref
  useImperativeHandle(ref, () => canvas.current!, []);
  const { theme } = useTheme();
  const darkMode = theme === 'dark';
  const { textColor, gridColor, tooltipTitleColor, tooltipBodyColor, tooltipBgColor, tooltipBorderColor } = chartColors;

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
            quarter: '[Q]Q YYYY', // "Q1 2025"
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
    const isPercentageMode = stackingMode === 'percentage';

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
            stacked: true, // Enable stacking on Y axis
            border: {
              display: false,
            },
            ...(isPercentageMode ? { max: 100 } : {}),
            ticks: {
              maxTicksLimit: 5,
              callback: (value) => {
                // Get measure type from chart data, fallback to 'number'
                const measureType = (data as unknown as Record<string, unknown>)?.measureType || 'number';
                if (isPercentageMode) {
                  return `${value}%`;
                }
                return simplifiedChartTransformer.formatValue(+value, measureType as string);
              },
              color: darkMode ? textColor.dark : textColor.light,
            },
            grid: {
              color: darkMode ? gridColor.dark : gridColor.light,
            },
          },
          x: {
            stacked: true, // Enable stacking on X axis
            type: 'category', // Use category axis for bar charts
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
            mode: 'index',
            intersect: false,
            padding: 12,
            callbacks: {
              title: (context) => {
                // Format tooltip title based on frequency
                const date = new Date(context[0]?.label || '');
                return date.toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: frequency === 'Weekly' ? 'numeric' : undefined
                });
              },
              label: (context) => {
                // Get measure type from dataset metadata, fallback to chart data, then to 'number'
                const measureType = (context.dataset as unknown as { measureType?: string })?.measureType || 
                                  ((context.chart.data as unknown as { measureType?: string })?.measureType) || 
                                  'number';
                
                if (isPercentageMode) {
                  // In percentage mode, show both percentage and actual value
                  const percentage = context.parsed.y.toFixed(1);
                  return `${context.dataset.label}: ${percentage}%`;
                }
                
                const formattedValue = simplifiedChartTransformer.formatValue(context.parsed.y, measureType as string);
                return `${context.dataset.label}: ${formattedValue}`;
              },
              footer: (tooltipItems) => {
                // Show total across all stacks
                if (isPercentageMode) {
                  return 'Total: 100%';
                }
                
                const total = tooltipItems.reduce((sum, item) => sum + item.parsed.y, 0);
                const measureType = ((tooltipItems[0]?.chart.data as unknown as Record<string, unknown>)?.measureType || 'number') as string;
                return `Total: ${simplifiedChartTransformer.formatValue(total, measureType)}`;
              },
            },
            titleColor: darkMode ? tooltipTitleColor.dark : tooltipTitleColor.light,
            bodyColor: darkMode ? tooltipBodyColor.dark : tooltipBodyColor.light,
            footerColor: darkMode ? tooltipTitleColor.dark : tooltipTitleColor.light,
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
              button.style.minWidth = '0'; // Allow shrinking
              button.style.maxWidth = '200px'; // Limit button width
              button.style.margin = '2px'; // Compact spacing
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
              value.style.fontSize = '18px'; // Reduced from 30px
              value.style.lineHeight = '1.4';
              value.style.fontWeight = '600'; // Reduced from 700
              value.style.marginRight = '6px'; // Reduced from 8px
              value.style.pointerEvents = 'none';
              const label = document.createElement('span');
              label.classList.add('text-gray-500', 'dark:text-gray-400');
              label.style.fontSize = '12px'; // Reduced from 14px
              label.style.lineHeight = '1.3';
              label.style.whiteSpace = 'nowrap';
              label.style.overflow = 'hidden';
              label.style.textOverflow = 'ellipsis';
              label.style.maxWidth = '120px'; // Limit label width
              // Calculate total for this dataset
              const dataset = c.data.datasets[item.datasetIndex!];
              const dataArray = dataset?.data || [];
              
              const theValue: number = dataArray.reduce(
                (sum: number, value) => {
                  // Handle Chart.js data types safely
                  if (typeof value === 'number') {
                    return sum + value;
                  } else if (value && typeof value === 'object' && 'y' in value) {
                    // Handle Point objects
                    return sum + (typeof value.y === 'number' ? value.y : 0);
                  }
                  return sum;
                },
                0
              ) as number;
              
              // Get measure type from chart data, fallback to 'number'
              const measureType = ((data as unknown as Record<string, unknown>)?.measureType || 'number') as string;
              const valueText = document.createTextNode(simplifiedChartTransformer.formatValue(theValue, measureType));
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
  }, [frequency, stackingMode]);

  useEffect(() => {
    if (!chart) return;

    // Update theme colors
    if (darkMode) {
      chart.options.scales!.x!.ticks!.color = textColor.dark;
      chart.options.scales!.y!.ticks!.color = textColor.dark;
      chart.options.scales!.y!.grid!.color = gridColor.dark;
      chart.options.plugins!.tooltip!.titleColor = tooltipTitleColor.dark;
      chart.options.plugins!.tooltip!.bodyColor = tooltipBodyColor.dark;
      chart.options.plugins!.tooltip!.footerColor = tooltipTitleColor.dark;
      chart.options.plugins!.tooltip!.backgroundColor = tooltipBgColor.dark;
      chart.options.plugins!.tooltip!.borderColor = tooltipBorderColor.dark;
      if (chart.options.plugins!.legend!.labels) {
        chart.options.plugins!.legend!.labels.color = textColor.dark;
      }
    } else {
      chart.options.scales!.x!.ticks!.color = textColor.light;
      chart.options.scales!.y!.ticks!.color = textColor.light;
      chart.options.scales!.y!.grid!.color = gridColor.light;
      chart.options.plugins!.tooltip!.titleColor = tooltipTitleColor.light;
      chart.options.plugins!.tooltip!.bodyColor = tooltipBodyColor.light;
      chart.options.plugins!.tooltip!.footerColor = tooltipTitleColor.light;
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
    if (!chart || !canvas.current) return;

    // Let Chart.js handle responsive sizing automatically
    chart.resize();
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
            overflowX: 'hidden'
          }}
        ></ul>
      </div>
      <div className="flex-1 min-h-0">
        <canvas 
          ref={canvas} 
          style={{ 
            width: '100%', 
            height: '100%',
            display: 'block'
          }}
        />
      </div>
    </div>
  );
});

export default AnalyticsStackedBarChart;
