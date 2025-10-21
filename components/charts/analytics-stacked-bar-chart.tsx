'use client';

import type { ChartData } from 'chart.js';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  TimeScale,
  Tooltip,
} from 'chart.js';
import { useTheme } from 'next-themes';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { chartColors } from '@/components/charts/chartjs-config';
import 'chartjs-adapter-moment';
import moment from 'moment';
import { formatValue, formatValueCompact } from '@/lib/utils/chart-data/formatters/value-formatter';
import { getMeasureTypeFromChart } from '@/lib/utils/type-guards';

Chart.register(BarController, BarElement, LinearScale, CategoryScale, TimeScale, Tooltip, Legend);

interface AnalyticsStackedBarChartProps {
  data: ChartData;
  width: number;
  height: number;
  frequency?: string; // For time axis configuration
  stackingMode?: 'normal' | 'percentage'; // Stacking mode
}

const AnalyticsStackedBarChart = forwardRef<HTMLCanvasElement, AnalyticsStackedBarChartProps>(
  function AnalyticsStackedBarChart(
    { data, width, height, frequency = 'Monthly', stackingMode = 'normal' },
    ref
  ) {
    const [chart, setChart] = useState<Chart | null>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const legend = useRef<HTMLUListElement>(null);

    // Expose canvas element to parent via ref
    useImperativeHandle(ref, () => canvas.current!, []);
    const { theme } = useTheme();
    const darkMode = theme === 'dark';
    const {
      textColor,
      gridColor,
      tooltipTitleColor,
      tooltipBodyColor,
      tooltipBgColor,
      tooltipBorderColor,
    } = chartColors;

    // Configure time display formats based on frequency
    const getTimeConfig = () => {
      switch (frequency) {
        case 'Daily':
          return {
            unit: 'day',
            displayFormats: {
              day: 'DD-MMM-YY', // "15-Sep-25"
            },
            tooltipFormat: 'DD-MMM-YYYY', // "15-Sep-2025"
          };
        case 'Weekly':
          return {
            unit: 'week',
            displayFormats: {
              week: 'DD-MMM-YY', // "20-JUL-25"
            },
            tooltipFormat: 'DD-MMM-YYYY',
          };
        case 'Monthly':
          return {
            unit: 'month',
            displayFormats: {
              month: 'MMM YYYY', // "Jul 2025"
            },
            tooltipFormat: 'MMM YYYY',
          };
        case 'Quarterly':
          return {
            unit: 'quarter',
            displayFormats: {
              quarter: '[Q]Q YYYY', // "Q1 2025"
            },
            tooltipFormat: '[Q]Q YYYY',
          };
        default:
          return {
            unit: 'month',
            displayFormats: {
              month: 'MMM YYYY',
            },
            tooltipFormat: 'MMM YYYY',
          };
      }
    };

    // Chart initialization - deferred to prevent race condition with React 19 concurrent rendering
    useEffect(() => {
      const ctx = canvas.current;
      
      // Safety check: ensure canvas is properly mounted
      if (!ctx?.parentElement || !ctx.isConnected) return;

      const _timeConfig = getTimeConfig();
      const isPercentageMode = stackingMode === 'percentage';

      // Defer initialization until after React's layout phase (fixes race condition)
      const rafId = requestAnimationFrame(() => {
        // Double RAF ensures we're after paint
        requestAnimationFrame(() => {
          // Re-check connection after deferral
          if (!ctx.isConnected) {
            console.warn('[AnalyticsStackedBarChart] Canvas disconnected during initialization deferral');
            return;
          }

      const newChart = new Chart(ctx, {
        type: 'bar',
        data: data,
        options: {
          layout: {
            padding: {
              top: 8,
              bottom: 4,
              left: 12,
              right: 12,
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
                  const measureType = getMeasureTypeFromChart(data, 'number');
                  if (isPercentageMode) {
                    return `${value}%`;
                  }
                  // Use compact format for Y-axis to save space (e.g., $2.5M instead of $2,500,000)
                  return formatValueCompact(+value, measureType);
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
              mode: 'point',
              intersect: true,
              padding: 12,
              callbacks: {
                title: (context) => {
                  // Format tooltip title based on frequency
                  // Use moment.js for Safari/iOS compatibility - new Date() parsing is unreliable
                  const labelValue = context[0]?.label || '';
                  const parsedDate = moment(
                    labelValue,
                    ['YYYY-MM-DD', 'MMM YYYY', 'DD-MMM-YY', moment.ISO_8601],
                    true
                  );

                  if (!parsedDate.isValid()) {
                    return labelValue;
                  }

                  if (frequency === 'Daily') {
                    return parsedDate.format('MMM D, YYYY');
                  } else if (frequency === 'Weekly') {
                    return parsedDate.format('MMM D, YYYY');
                  } else if (frequency === 'Quarterly') {
                    return parsedDate.format('[Q]Q YYYY');
                  } else {
                    return parsedDate.format('MMM YYYY');
                  }
                },
                label: (context) => {
                  // Get measure type from dataset metadata, fallback to chart data, then to 'number'
                  const datasetMeasureType = getMeasureTypeFromChart(context.dataset);
                  const chartMeasureType = getMeasureTypeFromChart(context.chart.data);
                  const measureType =
                    datasetMeasureType !== 'number' ? datasetMeasureType : chartMeasureType;

                  const value = context.parsed.y ?? 0;

                  if (isPercentageMode) {
                    // In percentage mode, show both percentage and actual value
                    const percentage = value.toFixed(1);
                    return `${context.dataset.label}: ${percentage}%`;
                  }

                  const formattedValue = formatValue(value, measureType);
                  return `${context.dataset.label}: ${formattedValue}`;
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
            intersect: true,
            mode: 'point',
          },
          animation: {
            duration: 500,
          },
          maintainAspectRatio: false,
          responsive: false, // Disable Chart.js responsive mode (we handle it manually below)
          resizeDelay: 200,
        },
        plugins: [
          {
            id: 'htmlLegend',
            afterUpdate(c, _args, _options) {
              const ul = legend.current;
              if (!ul || !ul.isConnected) return;
              // Remove old legend items
              while (ul.firstChild) {
                ul.firstChild.remove();
              }
              // Reuse the built-in legendItems generator
              const items = c.options.plugins?.legend?.labels?.generateLabels?.(c);

              // Calculate totals for each item and sort by value (descending)
              const itemsWithTotals =
                items?.map((item) => {
                  const dataset = c.data.datasets[item.datasetIndex!];
                  const dataArray = dataset?.data || [];
                  const total = dataArray.reduce((sum: number, value) => {
                    if (typeof value === 'number') {
                      return sum + value;
                    } else if (value && typeof value === 'object' && 'y' in value) {
                      return sum + (typeof value.y === 'number' ? value.y : 0);
                    }
                    return sum;
                  }, 0) as number;
                  return { item, total };
                }) || [];

              // Sort by total value descending (largest to smallest)
              itemsWithTotals.sort((a, b) => b.total - a.total);

              itemsWithTotals.forEach(({ item, total: theValue }) => {
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
                value.style.fontSize = '15px'; // Between value and label (was 18px)
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

                // theValue already calculated during sorting step
                // Get measure type from chart data, fallback to 'number'
                const measureType = getMeasureTypeFromChart(data, 'number');
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
        });
      });

      return () => {
        // Clean up animation frame if component unmounts during deferral
        cancelAnimationFrame(rafId);
        // Destroy chart synchronously to prevent canvas reuse errors
        if (chart) {
          chart.destroy();
        }
      };
    }, [frequency, stackingMode]); // Keep dependencies for re-initialization

    // Update data when it changes (without recreating chart)
    useEffect(() => {
      if (!chart || !canvas.current?.isConnected) return;

      chart.data = data;
      chart.update('none'); // Skip animation for data updates
    }, [chart, data]);

    useEffect(() => {
      if (!chart || !canvas.current) return;

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
      <div className="w-full h-full flex flex-col">
        <div className="px-2 py-1 flex-shrink-0 overflow-hidden">
          <ul
            ref={legend}
            className="flex flex-wrap gap-x-2 gap-y-1"
            style={{
              maxHeight: '60px', // Reduced max height for tighter layout
              overflowY: 'auto',
              overflowX: 'hidden',
            }}
          ></ul>
        </div>
        <div className="flex-1 min-h-0">
          <canvas
            ref={canvas}
            width={width}
            height={height}
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

export default AnalyticsStackedBarChart;
