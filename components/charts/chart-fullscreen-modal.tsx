'use client';

import type { Chart as ChartType, ChartTypeRegistry } from 'chart.js';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  TimeScale,
  Tooltip,
} from 'chart.js';
import { useTheme } from 'next-themes';
import { useEffect, useId, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { ChartData } from '@/lib/types/analytics';
import 'chartjs-adapter-moment';
import zoomPlugin from 'chartjs-plugin-zoom';
import moment from 'moment';
import { chartColors } from '@/components/charts/chartjs-config';
import { formatValue, formatValueCompact } from '@/lib/utils/chart-data/formatters/value-formatter';
import { createPeriodComparisonHtmlLegend } from '@/lib/utils/period-comparison-legend';
import { createPeriodComparisonTooltipCallbacks } from '@/lib/utils/period-comparison-tooltips';
import { apiClient } from '@/lib/api/client';
import type { AvailableDimensionsResponse, DimensionExpandedChartData, ExpansionDimension } from '@/lib/types/dimensions';
import DimensionSelector from './dimension-selector';
import DimensionComparisonView from './dimension-comparison-view';

// Register zoom plugin (moved inside component to avoid affecting global Chart.js state at module load time)
let pluginsRegistered = false;

interface ChartFullscreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  chartTitle: string;
  chartData: ChartData;
  chartType: 'line' | 'bar' | 'stacked-bar' | 'horizontal-bar';
  frequency?: string;
  stackingMode?: 'normal' | 'percentage';
  chartDefinitionId?: string;
  currentFilters?: {
    startDate?: string | null;
    endDate?: string | null;
    organizationId?: string | null;
    practiceUids?: number[];
    providerName?: string | null;
  };
  chartConfig?: Record<string, unknown>;
}

export default function ChartFullscreenModal({
  isOpen,
  onClose,
  chartTitle,
  chartData,
  chartType,
  frequency = 'Monthly',
  stackingMode = 'normal',
  chartDefinitionId,
  currentFilters = {},
  chartConfig,
}: ChartFullscreenModalProps) {
  const [chart, setChart] = useState<ChartType | null>(null);
  const [mounted, setMounted] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const legendRef = useRef<HTMLUListElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const darkMode = theme === 'dark';

  const chartTitleId = useId();
  
  // Dimension expansion state
  const [showDimensionSelector, setShowDimensionSelector] = useState(false);
  const [availableDimensions, setAvailableDimensions] = useState<ExpansionDimension[]>([]);
  const [expandedData, setExpandedData] = useState<DimensionExpandedChartData | null>(null);
  const [dimensionLoading, setDimensionLoading] = useState(false);

  // Callback ref to ensure canvas is mounted
  const setCanvasRef = (element: HTMLCanvasElement | null) => {
    canvasRef.current = element;
  };

  // Fetch available dimensions when modal opens
  useEffect(() => {
    if (isOpen && chartDefinitionId && !expandedData) {
      fetchAvailableDimensions();
    }
  }, [isOpen, chartDefinitionId]);

  const fetchAvailableDimensions = useCallback(async () => {
    if (!chartDefinitionId) return;
    
    try {
      const response = await apiClient.get<AvailableDimensionsResponse>(
        `/api/admin/analytics/charts/${chartDefinitionId}/dimensions`
      );
      setAvailableDimensions(response.dimensions || []);
    } catch (_error) {
      // Silently fail - dimensions are optional feature
      setAvailableDimensions([]);
    }
  }, [chartDefinitionId]);

  const handleExpandByDimension = useCallback(() => {
    if (availableDimensions.length === 1) {
      // Auto-expand if only one dimension
      handleDimensionSelect(availableDimensions[0]!);
    } else {
      setShowDimensionSelector(true);
    }
  }, [availableDimensions]);

  const handleDimensionSelect = useCallback(async (dimension: ExpansionDimension) => {
    setShowDimensionSelector(false);
    setDimensionLoading(true);

    try {
      // Build baseFilters ensuring ALL runtime filters are included
      const baseFilters: Record<string, unknown> = {
        // Copy all filters from currentFilters (dashboard universal filters)
        ...currentFilters,
      };
      
      // Include frequency for multi-series/dual-axis charts (required for measure-based data sources)
      if (frequency) {
        baseFilters.frequency = frequency;
      }

      console.log('Dimension expansion baseFilters:', baseFilters);

      const response = await apiClient.post<DimensionExpandedChartData>(
        `/api/admin/analytics/charts/${chartDefinitionId}/expand`,
        {
          dimensionColumn: dimension.columnName,
          baseFilters,
          limit: 20,
        }
      );
      setExpandedData(response);
    } catch (error) {
      console.error('Failed to expand by dimension:', error);
    } finally {
      setDimensionLoading(false);
    }
  }, [chartDefinitionId, currentFilters]);

  const handleCollapseDimension = useCallback(() => {
    setExpandedData(null);
    setShowDimensionSelector(false);
  }, []);

  // Handle client-side mounting for portal and register plugins
  useEffect(() => {
    if (!pluginsRegistered) {
      Chart.register(
        BarController,
        BarElement,
        LineController,
        LineElement,
        PointElement,
        Filler,
        LinearScale,
        CategoryScale,
        TimeScale,
        Tooltip,
        Legend,
        zoomPlugin
      );
      pluginsRegistered = true;
    }
    setMounted(true);
  }, []);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  // Configure time display formats based on frequency
  const getTimeConfig = () => {
    switch (frequency) {
      case 'Weekly':
        return {
          unit: 'week',
          displayFormats: {
            week: 'DD-MMM-YY',
          },
          tooltipFormat: 'DD-MMM-YYYY',
        };
      case 'Monthly':
        return {
          unit: 'month',
          displayFormats: {
            month: 'MMM YYYY',
          },
          tooltipFormat: 'MMM YYYY',
        };
      case 'Quarterly':
        return {
          unit: 'quarter',
          displayFormats: {
            quarter: '[Q]Q YYYY',
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

  // Initialize chart (reinitialize when collapsing from dimension expansion)
  useEffect(() => {
    if (!isOpen || !canvasRef.current || !chartData || expandedData) return;

    const ctx = canvasRef.current;
    const _timeConfig = getTimeConfig();

    // Get fresh color values inside useEffect to ensure they're read after theme is loaded
    const { textColor, gridColor, tooltipBodyColor, tooltipBgColor, tooltipBorderColor } =
      chartColors;

    // Check if this is period comparison data
    const hasPeriodComparison = chartData.datasets.some(
      (ds) => ds.label?.includes('Current Period') || ds.label?.includes('Previous Period')
    );

    // Convert our ChartData to Chart.js ChartData format
    const chartjsData = {
      labels: chartData.labels,
      datasets: chartData.datasets,
    };

    const isHorizontal = chartType === 'horizontal-bar';
    const actualChartType = chartType === 'line' ? 'line' : 'bar';

    const newChart = new Chart(ctx, {
      type: actualChartType,
      data: chartjsData,
      options: {
        indexAxis: isHorizontal ? 'y' : 'x', // Horizontal bars use 'y' as the index axis
        layout: {
          padding: {
            top: 8,
            bottom: 4,
            left: 12,
            right: 12,
          },
        },
        scales: isHorizontal
          ? {
              // For horizontal bars: X is value, Y is category
              x: {
                border: {
                  display: false,
                },
                grid: {
                  color: darkMode ? gridColor.dark : gridColor.light,
                },
                beginAtZero: true,
                ticks: {
                  maxTicksLimit: 5,
                  color: darkMode ? textColor.dark : textColor.light,
                  font: {
                    size: 14,
                  },
                  callback: (value: string | number) => {
                    const numValue = typeof value === 'string' ? parseFloat(value) : value;
                    const measureType = chartData.measureType || 'number';
                    return formatValueCompact(numValue, measureType);
                  },
                },
              },
              y: {
                type: 'category',
                border: {
                  display: false,
                },
                grid: {
                  display: false,
                },
                ticks: {
                  color: darkMode ? textColor.dark : textColor.light,
                  font: {
                    size: 14,
                  },
                },
              },
            }
          : {
              // For vertical bars: X is category, Y is value
              x: {
                type: 'category',
                stacked: chartType === 'stacked-bar',
                border: {
                  display: false,
                },
                grid: {
                  display: false,
                },
                ticks: {
                  color: darkMode ? textColor.dark : textColor.light,
                  maxRotation: 0,
                  autoSkipPadding: 48,
                  font: {
                    size: 14,
                  },
                },
              },
              y: {
                stacked: chartType === 'stacked-bar',
                border: {
                  display: false,
                },
                grid: {
                  color: darkMode ? gridColor.dark : gridColor.light,
                },
                beginAtZero: true,
                max: chartType === 'stacked-bar' && stackingMode === 'percentage' ? 100 : undefined,
                ticks: {
                  maxTicksLimit: 5,
                  color: darkMode ? textColor.dark : textColor.light,
                  font: {
                    size: 14, // Larger font for fullscreen
                  },
                  callback: (value: string | number) => {
                    const numValue = typeof value === 'string' ? parseFloat(value) : value;

                    if (chartType === 'stacked-bar' && stackingMode === 'percentage') {
                      return `${numValue}%`;
                    }

                    const measureType = chartData.measureType || 'number';
                    return formatValueCompact(numValue, measureType);
                  },
                },
              },
            },
        interaction: {
          mode: 'nearest',
          intersect: true,
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: (hasPeriodComparison
            ? createPeriodComparisonTooltipCallbacks(frequency, darkMode)
            : {
                enabled: true,
                mode: 'nearest',
                intersect: true,
                backgroundColor: darkMode ? tooltipBgColor.dark : tooltipBgColor.light,
                borderColor: darkMode ? tooltipBorderColor.dark : tooltipBorderColor.light,
                borderWidth: 1,
                titleColor: darkMode ? tooltipBodyColor.dark : tooltipBodyColor.light,
                bodyColor: darkMode ? tooltipBodyColor.dark : tooltipBodyColor.light,
                bodySpacing: 8,
                padding: 12,
                boxPadding: 6,
                usePointStyle: true,
                callbacks: {
                  title: (context: { label?: string }[]) => {
                    const labelValue = context[0]?.label || '';
                    const parsedDate = moment(
                      labelValue,
                      ['YYYY-MM-DD', 'MMM YYYY', 'DD-MMM-YY', moment.ISO_8601],
                      true
                    );

                    if (!parsedDate.isValid()) {
                      return labelValue;
                    }

                    if (frequency === 'Weekly') {
                      return parsedDate.format('MMM D, YYYY');
                    } else if (frequency === 'Quarterly') {
                      return parsedDate.format('[Q]Q YYYY');
                    } else {
                      return parsedDate.format('MMM YYYY');
                    }
                  },
                  label: (context: { dataset: { label?: string }; parsed: { y: number } }) => {
                    const label = context.dataset.label || '';
                    const value = context.parsed.y;
                    const measureType = chartData.measureType || 'number';
                    const formattedValue = formatValue(value, measureType);

                    if (chartType === 'stacked-bar' && stackingMode === 'percentage') {
                      return `${label}: ${value.toFixed(1)}%`;
                    }

                    return `${label}: ${formattedValue}`;
                  },
                },
              }) as never,
          zoom: {
            pan: {
              enabled: true,
              mode: 'x', // Only pan horizontally
            },
            zoom: {
              wheel: {
                enabled: true,
                speed: 0.05, // Slower zoom speed (was 0.1)
              },
              pinch: {
                enabled: true,
              },
              mode: 'x', // Only zoom horizontally, keep full bars visible vertically
            },
            limits: {
              x: { min: 'original', max: 'original' },
              y: { min: 0, max: 'original' },
            },
          },
        },
        responsive: true,
        maintainAspectRatio: false,
      },
    });

    // Type cast needed for Chart.js union type compatibility
    setChart(newChart as Chart<keyof ChartTypeRegistry>);

    // Generate HTML legend
    if (legendRef.current) {
      const ul = legendRef.current;
      ul.innerHTML = '';

      if (hasPeriodComparison) {
        // Type cast needed for Chart.js plugin compatibility
        createPeriodComparisonHtmlLegend(newChart as Chart<keyof ChartTypeRegistry>, ul, {});
      } else {
        // Type cast needed for Chart.js plugin compatibility
        const items = newChart.options.plugins?.legend?.labels?.generateLabels?.(
          newChart as Chart<keyof ChartTypeRegistry>
        );

        // Calculate totals and sort by value
        const itemsWithTotals =
          items?.map((item) => {
            const dataset = newChart.data.datasets[item.datasetIndex!];
            const dataArray = dataset?.data || [];
            const total = dataArray.reduce((sum: number, value: unknown) => {
              if (typeof value === 'number') {
                return sum + value;
              } else if (value && typeof value === 'object' && 'y' in value) {
                const yValue = (value as { y: unknown }).y;
                return sum + (typeof yValue === 'number' ? yValue : 0);
              }
              return sum;
            }, 0) as number;
            return { item, total };
          }) || [];

        itemsWithTotals.sort((a, b) => b.total - a.total);

        itemsWithTotals.forEach(({ item, total }) => {
          const li = document.createElement('li');
          li.className =
            'flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded transition-colors';

          const colorBox = document.createElement('span');
          colorBox.className = 'block w-3 h-3 rounded-sm mr-2 flex-shrink-0';
          colorBox.style.backgroundColor = String(item.fillStyle);
          colorBox.style.borderColor = String(item.strokeStyle);
          colorBox.style.borderWidth = `${item.lineWidth}px`;

          const labelContainer = document.createElement('div');
          labelContainer.className = 'flex items-center flex-1 min-w-0';
          labelContainer.appendChild(colorBox);

          const labelText = document.createElement('span');
          labelText.className = 'text-sm text-gray-600 dark:text-gray-400 truncate';
          labelText.textContent = item.text;
          labelContainer.appendChild(labelText);

          const valueSpan = document.createElement('span');
          valueSpan.className = 'text-[15px] font-semibold text-gray-800 dark:text-gray-100 ml-3';
          const measureType = chartData.measureType || 'number';
          valueSpan.textContent = formatValue(total, measureType);

          li.appendChild(labelContainer);
          li.appendChild(valueSpan);

          li.onclick = () => {
            const index = item.datasetIndex!;
            const meta = newChart.getDatasetMeta(index);
            meta.hidden = !meta.hidden;
            newChart.update();
          };

          ul.appendChild(li);
        });
      }
    }

    return () => {
      newChart.destroy();
    };
  }, [isOpen, mounted, chartData, chartType, frequency, stackingMode, darkMode, expandedData]);

  const handleResetZoom = () => {
    if (chart) {
      chart.resetZoom();
    }
  };

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen || !mounted) {
    return null;
  }

  const modalContent = (
    <div
      ref={modalRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 sm:p-4"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={chartTitleId}
    >
      <div
        className="bg-white dark:bg-gray-800 sm:rounded-xl shadow-2xl w-full h-full sm:h-auto sm:max-w-7xl sm:max-h-[95vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
          <h2
            id={chartTitleId}
            className="font-semibold text-gray-800 dark:text-gray-100 text-lg"
          >
            {chartTitle}
          </h2>
          <div className="flex items-center gap-2">
            {/* Expand by Dimension button - only show if dimensions available */}
            {!expandedData && availableDimensions.length > 0 && chartDefinitionId && (
              <button 
                type="button" 
                onClick={handleExpandByDimension}
                disabled={dimensionLoading}
                className="px-3 py-1.5 text-sm bg-violet-100 dark:bg-violet-900 hover:bg-violet-200 dark:hover:bg-violet-800 text-violet-700 dark:text-violet-200 rounded-md transition-colors disabled:opacity-50"
                aria-label="Expand by dimension"
              >
                {dimensionLoading ? 'Loading...' : 'Expand by Dimension'}
              </button>
            )}
            {/* Collapse button when viewing dimension expansion */}
            {expandedData && (
              <button 
                type="button" 
                onClick={handleCollapseDimension}
                className="px-3 py-1.5 text-sm bg-violet-100 dark:bg-violet-900 hover:bg-violet-200 dark:hover:bg-violet-800 text-violet-700 dark:text-violet-200 rounded-md transition-colors"
                aria-label="Collapse to single chart"
              >
                Collapse
              </button>
            )}
            {!expandedData && (
              <button type="button" onClick={handleResetZoom}
                className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md transition-colors"
                aria-label="Reset zoom level"
              >
                Reset Zoom
              </button>
            )}
            <button type="button" onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              aria-label="Close fullscreen view"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </header>

        {/* Chart Content */}
        <div className="flex-1 p-6 overflow-auto">
          {/* Show dimension selector if active */}
          {showDimensionSelector && availableDimensions.length > 0 && (
            <div className="max-w-2xl mx-auto">
              <DimensionSelector
                availableDimensions={availableDimensions}
                onSelect={handleDimensionSelect}
                onCancel={() => setShowDimensionSelector(false)}
              />
            </div>
          )}

          {/* Show dimension comparison view if expanded */}
          {expandedData && !showDimensionSelector && (
            <DimensionComparisonView
              dimension={expandedData.dimension}
              chartDefinition={{
                chart_definition_id: chartDefinitionId || '',
                chart_name: chartTitle,
                chart_type: chartType,
                ...(chartConfig && { chart_config: chartConfig }),
              }}
              dimensionCharts={expandedData.charts}
              position={{ x: 0, y: 0, w: 12, h: 6 }}
            />
          )}

          {/* Show normal chart if not in dimension mode */}
          {!showDimensionSelector && !expandedData && (
            <div className="w-full h-[calc(90vh-200px)] min-h-[400px]">
              <canvas ref={setCanvasRef} />
            </div>
          )}

          {/* Legend */}
          <div className="mt-4">
            <ul
              ref={legendRef}
              className="flex flex-wrap gap-x-6 gap-y-2 max-h-60 overflow-y-auto px-2 py-1"
            />
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
