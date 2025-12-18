'use client';

import type { ActiveElement, ChartEvent, ChartTypeRegistry, TooltipItem } from 'chart.js';
import {
  CategoryScale,
  Chart,
  Filler,
  Legend,
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
import { ScrollableLegendContainer, COMPACT_LEGEND_STYLES } from '@/components/ui/scrollable-legend';
import 'chartjs-adapter-moment';
import moment from 'moment';
import type { ChartData } from '@/lib/types/analytics';
import {
  formatValue as formatChartValue,
  formatValueCompact as formatChartValueCompact,
} from '@/lib/utils/chart-data/formatters/value-formatter';
import { createPeriodComparisonTooltipCallbacks } from '@/lib/utils/period-comparison-tooltips';
import { getTimeConfig } from '@/lib/utils/chart-fullscreen-config';
import { isChartSafeToUpdate } from '@/lib/utils/chart-safety';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  Filler,
  LinearScale,
  CategoryScale,
  TimeScale,
  Tooltip,
  Legend
);

interface AnalyticsLineChartProps {
  data: ChartData;
  width: number;
  height: number;
  frequency?: string; // For time axis configuration
  /** Chart.js onClick handler for drill-down functionality */
  chartJsOnClick?: (event: ChartEvent, elements: ActiveElement[], chart: Chart) => void;
}

const AnalyticsLineChart = forwardRef<HTMLCanvasElement, AnalyticsLineChartProps>(
  function AnalyticsLineChart({ data, width, height, frequency = 'Monthly', chartJsOnClick }, ref) {
    const [chart, setChart] = useState<Chart<'line'> | null>(null);
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
      if (!ctx?.parentElement || !ctx.isConnected) {
        return;
      }

      const _timeConfig = getTimeConfig(frequency);

      // Defer initialization until after React's layout phase (fixes race condition)
      const rafId = requestAnimationFrame(() => {
        // Double RAF ensures we're after paint
        requestAnimationFrame(() => {
          // Re-check connection after deferral
          if (!ctx.isConnected) {
            console.warn('[AnalyticsLineChart] Canvas disconnected during initialization deferral');
            return;
          }

          // Destroy existing chart if any (prevents canvas reuse error)
          if (chartRef.current) {
            chartRef.current.destroy();
            chartRef.current = null;
          }

          const newChart = new Chart(ctx, {
            type: 'line',
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
                  border: {
                    display: false,
                  },
                  ticks: {
                    maxTicksLimit: 5,
                    callback: (value) => {
                      // Get measure type from chart data, fallback to 'number'
                      const measureType = data.measureType || 'number';
                      // Use compact format for Y-axis to save space (e.g., $2.5M instead of $2,500,000)
                      return formatChartValueCompact(+value, measureType);
                    },
                    color: darkMode ? textColor.dark : textColor.light,
                  },
                  grid: {
                    color: darkMode ? gridColor.dark : gridColor.light,
                  },
                },
                x: {
                  type: 'category', // Use category axis for line charts
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
                      // Use period comparison tooltips (works for both bar and line charts)
                      // Type cast needed due to Chart.js generic type limitations with union chart types
                      return createPeriodComparisonTooltipCallbacks<'line'>(frequency, darkMode) as unknown as ReturnType<typeof createPeriodComparisonTooltipCallbacks>;
                    }

                    // Default tooltip callbacks
                    return {
                      title: (tooltipItems: TooltipItem<'line' | 'bar'>[]) => {
                        // Format tooltip title based on frequency
                        // Use moment.js for Safari/iOS compatibility - new Date() parsing is unreliable
                        const labelValue = tooltipItems[0]?.label || '';
                        const parsedDate = moment(
                          labelValue,
                          ['YYYY-MM-DD', 'MMM YYYY', 'DD-MMM-YY', moment.ISO_8601],
                          true
                        );

                        if (!parsedDate.isValid()) {
                          // Fallback to raw label if parsing fails
                          return labelValue;
                        }

                        // Format based on frequency
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
                      label: (tooltipItem: TooltipItem<'line' | 'bar'>) => {
                        // Get measure type from dataset metadata, fallback to chart data, then to 'number'
                        const measureType =
                          (tooltipItem.dataset as { measureType?: string })?.measureType ||
                          (tooltipItem.chart.data as { measureType?: string })?.measureType ||
                          'number';
                        const value = tooltipItem.parsed.y ?? 0;
                        const formattedValue = formatChartValue(value, measureType);
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
                    const measureType = data.measureType || 'number';
                    const valueText = document.createTextNode(formatChartValue(theValue, measureType));
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

          chartRef.current = newChart as Chart<'line'>;
          setChart(newChart as Chart<'line'>);
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
    }, [frequency, chartJsOnClick]); // Keep frequency dependency for re-initialization

    // Update data when it changes (without recreating chart)
    useEffect(() => {
      if (!isChartSafeToUpdate(chartRef.current) || !canvas.current?.isConnected) return;

      // Type cast needed because ChartData from analytics types is more flexible than Chart.js types
      chartRef.current.data = data as typeof chartRef.current.data;
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
        currentChart.options.plugins!.tooltip!.bodyColor = tooltipBodyColor.dark;
        currentChart.options.plugins!.tooltip!.backgroundColor = tooltipBgColor.dark;
        currentChart.options.plugins!.tooltip!.borderColor = tooltipBorderColor.dark;
        if (currentChart.options.plugins!.legend!.labels) {
          currentChart.options.plugins!.legend!.labels.color = textColor.dark;
        }
      } else {
        currentChart.options.scales!.x!.ticks!.color = textColor.light;
        currentChart.options.scales!.y!.ticks!.color = textColor.light;
        currentChart.options.scales!.y!.grid!.color = gridColor.light;
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

export default AnalyticsLineChart;
