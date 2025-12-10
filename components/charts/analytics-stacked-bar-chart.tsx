'use client';

import type { ActiveElement, ChartData, ChartEvent } from 'chart.js';
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
import { ScrollableLegendContainer, COMPACT_LEGEND_STYLES } from '@/components/ui/scrollable-legend';
import 'chartjs-adapter-moment';
import moment from 'moment';
import { formatValue, formatValueCompact } from '@/lib/utils/chart-data/formatters/value-formatter';
import { getMeasureTypeFromChart } from '@/lib/utils/type-guards';
import { getTimeConfig } from '@/lib/utils/chart-fullscreen-config';

Chart.register(BarController, BarElement, LinearScale, CategoryScale, TimeScale, Tooltip, Legend);

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

interface AnalyticsStackedBarChartProps {
  data: ChartData;
  width: number;
  height: number;
  frequency?: string; // For time axis configuration
  stackingMode?: 'normal' | 'percentage'; // Stacking mode
  /** Chart.js onClick handler for drill-down functionality */
  chartJsOnClick?: (event: ChartEvent, elements: ActiveElement[], chart: Chart) => void;
}

const AnalyticsStackedBarChart = forwardRef<HTMLCanvasElement, AnalyticsStackedBarChartProps>(
  function AnalyticsStackedBarChart(
    { data, width, height, frequency = 'Monthly', stackingMode = 'normal', chartJsOnClick },
    ref
  ) {
    const [chart, setChart] = useState<Chart | null>(null);
    const chartRef = useRef<Chart | null>(null); // Ref for cleanup (avoids stale closure)
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

    // Chart initialization - deferred to prevent race condition with React 19 concurrent rendering
    useEffect(() => {
      const ctx = canvas.current;
      
      // Safety check: ensure canvas is properly mounted
      if (!ctx?.parentElement || !ctx.isConnected) return;

      const _timeConfig = getTimeConfig(frequency);
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

      // Destroy existing chart if any (prevents canvas reuse error)
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
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
                // Button element - compact design with touch-friendly sizing
                const button = document.createElement('button');
                button.style.display = 'inline-flex';
                button.style.alignItems = 'center';
                button.style.opacity = item.hidden ? '.3' : '';
                button.style.minHeight = COMPACT_LEGEND_STYLES.button.minHeight;
                button.style.maxWidth = '200px';
                button.style.padding = COMPACT_LEGEND_STYLES.button.padding;
                button.style.margin = COMPACT_LEGEND_STYLES.button.margin;
                button.style.borderRadius = COMPACT_LEGEND_STYLES.button.borderRadius;
                button.onclick = () => {
                  c.setDatasetVisibility(
                    item.datasetIndex!,
                    !c.isDatasetVisible(item.datasetIndex!)
                  );
                  c.update();
                };
                // Color box - compact sizing
                const box = document.createElement('span');
                box.style.display = 'block';
                box.style.width = COMPACT_LEGEND_STYLES.colorBox.width;
                box.style.height = COMPACT_LEGEND_STYLES.colorBox.height;
                box.style.borderRadius = '50%';
                box.style.marginRight = COMPACT_LEGEND_STYLES.colorBox.marginRight;
                box.style.flexShrink = '0';
                box.style.backgroundColor = item.fillStyle as string;
                box.style.pointerEvents = 'none';
                // Label container
                const labelContainer = document.createElement('span');
                labelContainer.style.display = 'flex';
                labelContainer.style.alignItems = 'center';
                labelContainer.style.minWidth = '0'; // Allow text truncation
                const value = document.createElement('span');
                value.classList.add('text-gray-800', 'dark:text-gray-100');
                value.style.fontSize = COMPACT_LEGEND_STYLES.value.fontSize;
                value.style.lineHeight = COMPACT_LEGEND_STYLES.value.lineHeight;
                value.style.fontWeight = '600';
                value.style.marginRight = COMPACT_LEGEND_STYLES.value.marginRight;
                value.style.pointerEvents = 'none';
                value.style.flexShrink = '0'; // Don't shrink values
                const label = document.createElement('span');
                label.classList.add('text-gray-500', 'dark:text-gray-400');
                label.style.fontSize = COMPACT_LEGEND_STYLES.label.fontSize;
                label.style.lineHeight = COMPACT_LEGEND_STYLES.label.lineHeight;
                label.style.whiteSpace = 'nowrap';
                label.style.overflow = 'hidden';
                label.style.textOverflow = 'ellipsis';
                label.style.maxWidth = COMPACT_LEGEND_STYLES.label.maxWidth;

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

          chartRef.current = newChart;
          setChart(newChart);
        });
      });

      return () => {
        // Clean up animation frame if component unmounts during deferral
        cancelAnimationFrame(rafId);
        // Destroy chart using ref (avoids stale closure issue)
        if (chartRef.current) {
          chartRef.current.destroy();
          chartRef.current = null;
        }
      };
    }, [frequency, stackingMode, chartJsOnClick]); // Keep dependencies for re-initialization

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
        currentChart.options.scales!.y!.grid!.color = gridColor.dark;
        currentChart.options.plugins!.tooltip!.titleColor = tooltipTitleColor.dark;
        currentChart.options.plugins!.tooltip!.bodyColor = tooltipBodyColor.dark;
        currentChart.options.plugins!.tooltip!.footerColor = tooltipTitleColor.dark;
        currentChart.options.plugins!.tooltip!.backgroundColor = tooltipBgColor.dark;
        currentChart.options.plugins!.tooltip!.borderColor = tooltipBorderColor.dark;
        if (currentChart.options.plugins!.legend!.labels) {
          currentChart.options.plugins!.legend!.labels.color = textColor.dark;
        }
      } else {
        currentChart.options.scales!.x!.ticks!.color = textColor.light;
        currentChart.options.scales!.y!.ticks!.color = textColor.light;
        currentChart.options.scales!.y!.grid!.color = gridColor.light;
        currentChart.options.plugins!.tooltip!.titleColor = tooltipTitleColor.light;
        currentChart.options.plugins!.tooltip!.bodyColor = tooltipBodyColor.light;
        currentChart.options.plugins!.tooltip!.footerColor = tooltipTitleColor.light;
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
        {/* Legend with scroll indicators */}
        <ScrollableLegendContainer maxHeight={52} className="flex-shrink-0 mx-1 mt-1">
          <ul
            ref={legend}
            className="flex flex-wrap gap-x-1 gap-y-0.5"
          />
        </ScrollableLegendContainer>
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

export default AnalyticsStackedBarChart;
