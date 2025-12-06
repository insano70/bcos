'use client';

import type { ActiveElement, ChartEvent, ChartTypeRegistry, TooltipItem } from 'chart.js';
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

/**
 * Check if chart is safe to update (not destroyed, canvas context valid)
 */
function isChartSafeToUpdate(chart: Chart | null): chart is Chart {
  if (!chart) return false;
  try {
    // Check if canvas and context are still valid
    return !!(chart.canvas && chart.ctx);
  } catch {
    return false;
  }
}

interface AnalyticsHorizontalBarChartProps {
  data: ChartData;
  width: number;
  height: number;
  /** Chart.js onClick handler for drill-down functionality */
  chartJsOnClick?: (event: ChartEvent, elements: ActiveElement[], chart: Chart) => void;
}

const AnalyticsHorizontalBarChart = forwardRef<HTMLCanvasElement, AnalyticsHorizontalBarChartProps>(
  function AnalyticsHorizontalBarChart({ data, width, height, chartJsOnClick }, ref) {
    const [chart, setChart] = useState<Chart | null>(null);
    const chartRef = useRef<Chart | null>(null); // Ref for cleanup (avoids stale closure)
    const canvas = useRef<HTMLCanvasElement>(null);
    const legend = useRef<HTMLUListElement>(null);

    // Expose canvas element to parent via ref
    useImperativeHandle(ref, () => canvas.current!, []);
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
            console.warn('[AnalyticsHorizontalBarChart] Canvas disconnected during initialization deferral');
            return;
          }

          // Destroy existing chart if any (prevents canvas reuse error)
          if (chartRef.current) {
            chartRef.current.destroy();
            chartRef.current = null;
          }

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
                  // Type assertion needed because createPeriodComparisonHorizontalTooltipCallbacks returns 'bar' type
                  // but this chart uses 'bar' | 'line' union type for flexibility
                  return createPeriodComparisonHorizontalTooltipCallbacks(darkMode) as unknown as {
                    title?: (tooltipItems: TooltipItem<'bar' | 'line'>[]) => string;
                    label?: (tooltipItem: TooltipItem<'bar' | 'line'>) => string;
                    footer?: (tooltipItems: TooltipItem<'bar' | 'line'>[]) => string[];
                  };
                }

                // Default tooltip callbacks
                return {
                  title: (tooltipItems: TooltipItem<'bar' | 'line'>[]) => {
                    // Show the category label as title
                    return tooltipItems[0]?.label || '';
                  },
                  label: (tooltipItem: TooltipItem<'bar' | 'line'>) => {
                    // Get measure type from dataset metadata, fallback to chart data, then to 'number'
                    const measureType =
                      (tooltipItem.dataset as { measureType?: string })?.measureType ||
                      (tooltipItem.chart.data as { measureType?: string })?.measureType ||
                      'number';
                    const value = tooltipItem.parsed.x ?? 0;
                    const formattedValue = formatValue(value, measureType);
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
          responsive: false, // Disable Chart.js responsive mode (we handle it manually below)
          resizeDelay: 200,
          // Drill-down click handler
          ...(chartJsOnClick && { onClick: chartJsOnClick }),
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
              // Type cast needed for Chart.js plugin compatibility with union types
              const items = c.options.plugins?.legend?.labels?.generateLabels?.(
                c as Chart<keyof ChartTypeRegistry>
              );
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

          // Type cast needed for Chart.js union type compatibility
          chartRef.current = newChart as Chart<keyof ChartTypeRegistry>;
          setChart(newChart as Chart<keyof ChartTypeRegistry>);
        });
      });

      return () => {
        // Clean up animation frame if component unmounts during deferral
        cancelAnimationFrame(rafId);
        // Destroy chart using ref (avoids stale closure issue)
        if (chartRef.current) {
          try {
            chartRef.current.destroy();
            chartRef.current = null;
          } catch {
            // Ignore errors during cleanup
          }
        }
      };
    }, [chartJsOnClick]); // Re-initialize when onClick handler changes

    // Update data when it changes (without recreating chart)
    useEffect(() => {
      if (!isChartSafeToUpdate(chartRef.current) || !canvas.current?.isConnected) return;

      chartRef.current.data = data;
      chartRef.current.update('none'); // Skip animation for data updates
    }, [chart, data]); // Keep chart dep to trigger on chart changes

    useEffect(() => {
      const currentChart = chartRef.current;
      if (!isChartSafeToUpdate(currentChart) || !canvas.current) return;

      // Update theme colors
      if (darkMode) {
        currentChart.options.scales!.x!.ticks!.color = textColor.dark;
        currentChart.options.scales!.y!.ticks!.color = textColor.dark;
        currentChart.options.scales!.x!.grid!.color = gridColor.dark;
        currentChart.options.plugins!.tooltip!.bodyColor = tooltipBodyColor.dark;
        currentChart.options.plugins!.tooltip!.backgroundColor = tooltipBgColor.dark;
        currentChart.options.plugins!.tooltip!.borderColor = tooltipBorderColor.dark;
        if (currentChart.options.plugins!.legend!.labels) {
          currentChart.options.plugins!.legend!.labels.color = textColor.dark;
        }
      } else {
        currentChart.options.scales!.x!.ticks!.color = textColor.light;
        currentChart.options.scales!.y!.ticks!.color = textColor.light;
        currentChart.options.scales!.x!.grid!.color = gridColor.light;
        currentChart.options.plugins!.tooltip!.bodyColor = tooltipBodyColor.light;
        currentChart.options.plugins!.tooltip!.backgroundColor = tooltipBgColor.light;
        currentChart.options.plugins!.tooltip!.borderColor = tooltipBorderColor.light;
        if (currentChart.options.plugins!.legend!.labels) {
          currentChart.options.plugins!.legend!.labels.color = textColor.light;
        }
      }
      currentChart.update('none');
    }, [theme, chart]); // Add chart dep to re-run when chart is ready

    // Manual responsive handling (replaces Chart.js responsive mode - preserves responsive design!)
    useEffect(() => {
      if (!isChartSafeToUpdate(chartRef.current) || !canvas.current?.isConnected) return;

      // Observe parent container for size changes
      const container = canvas.current.parentElement;
      if (!container) return;

      const resizeObserver = new ResizeObserver(() => {
        // Defer resize to next frame for safety
        requestAnimationFrame(() => {
          // Use helper to verify chart is safe to update
          if (isChartSafeToUpdate(chartRef.current) && canvas.current?.isConnected) {
            chartRef.current.resize();
          }
        });
      });

      resizeObserver.observe(container);

      return () => resizeObserver.disconnect();
    }, [chart]); // Keep chart dep to re-setup observer when chart changes

    // Handle explicit width/height prop changes
    useEffect(() => {
      if (!isChartSafeToUpdate(chartRef.current) || !canvas.current?.isConnected) return;

      chartRef.current.resize();
    }, [chart, width, height]); // Keep chart dep to trigger on chart changes

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
            width={width}
            height={height}
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              touchAction: 'manipulation',
            }}
          />
        </div>
      </div>
    );
  }
);

export default AnalyticsHorizontalBarChart;
