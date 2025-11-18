'use client';

import type { ChartConfiguration, Chart as ChartType } from 'chart.js';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import { useTheme } from 'next-themes';
import { useEffect, useId, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { chartColors } from '@/components/charts/chartjs-config';
import type { ChartData } from '@/lib/types/analytics';
import { formatValue, formatValueCompact } from '@/lib/utils/chart-data/formatters/value-formatter';
import { getMeasureTypeFromChart } from '@/lib/utils/type-guards';
import { apiClient } from '@/lib/api/client';
import type { AvailableDimensionsResponse, DimensionExpandedChartData, ExpansionDimension } from '@/lib/types/dimensions';
import DimensionSelector from './dimension-selector';
import DimensionComparisonView from './dimension-comparison-view';

// Register zoom plugin
let pluginsRegistered = false;

interface DualAxisFullscreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  chartTitle: string;
  chartData: ChartData;
  primaryAxisLabel?: string | undefined;
  secondaryAxisLabel?: string | undefined;
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

export default function DualAxisFullscreenModal({
  isOpen,
  onClose,
  chartTitle,
  chartData,
  primaryAxisLabel,
  secondaryAxisLabel,
  chartDefinitionId,
  currentFilters = {},
  chartConfig,
}: DualAxisFullscreenModalProps) {
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
      // Build baseFilters ensuring all security filters are included
      const baseFilters: Record<string, unknown> = {};
      
      // CRITICAL: Must include all filters to maintain data security
      if (currentFilters) {
        if (currentFilters.startDate) baseFilters.startDate = currentFilters.startDate;
        if (currentFilters.endDate) baseFilters.endDate = currentFilters.endDate;
        if (currentFilters.organizationId) baseFilters.organizationId = currentFilters.organizationId;
        if (currentFilters.practiceUids && currentFilters.practiceUids.length > 0) {
          baseFilters.practiceUids = currentFilters.practiceUids;
        }
        if (currentFilters.providerName) baseFilters.providerName = currentFilters.providerName;
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
        LineController,
        BarElement,
        LineElement,
        PointElement,
        LinearScale,
        CategoryScale,
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

  // Initialize chart
  useEffect(() => {
    if (!isOpen || !canvasRef.current || !chartData) return;

    const ctx = canvasRef.current;

    // Get fresh color values inside useEffect to ensure they're read after theme is loaded
    const { textColor, gridColor, tooltipBodyColor, tooltipBgColor, tooltipBorderColor } =
      chartColors;

    // Convert our ChartData to Chart.js ChartData format
    const chartjsData = {
      labels: chartData.labels,
      datasets: chartData.datasets,
    };

    const config: ChartConfiguration = {
      type: 'bar',
      data: chartjsData,
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
          x: {
            display: true,
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
          'y-left': {
            type: 'linear',
            position: 'left',
            display: true,
            title: {
              display: !!primaryAxisLabel,
              text: primaryAxisLabel || '',
              color: darkMode ? textColor.dark : textColor.light,
              font: {
                size: 14,
                weight: 'bold',
              },
            },
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
              callback: (tickValue: string | number) => {
                const value = Number(tickValue);
                const primaryMeasureType = chartData.datasets[0]?.measureType;
                return formatValueCompact(value, primaryMeasureType || 'number');
              },
            },
          },
          'y-right': {
            type: 'linear',
            position: 'right',
            display: true,
            title: {
              display: !!secondaryAxisLabel,
              text: secondaryAxisLabel || '',
              color: darkMode ? textColor.dark : textColor.light,
              font: {
                size: 14,
                weight: 'bold',
              },
            },
            border: {
              display: false,
            },
            grid: {
              drawOnChartArea: false, // Only show grid for left y-axis
            },
            beginAtZero: true,
            ticks: {
              maxTicksLimit: 5,
              color: darkMode ? textColor.dark : textColor.light,
              font: {
                size: 14,
              },
              callback: (tickValue: string | number) => {
                const value = Number(tickValue);
                const secondaryMeasureType = chartData.datasets[1]?.measureType;
                return formatValueCompact(value, secondaryMeasureType || 'number');
              },
            },
          },
        },
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            enabled: true,
            mode: 'index',
            intersect: false,
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
              label: (context) => {
                const label = context.dataset.label || '';
                const value = context.parsed.y ?? 0;
                const measureType = getMeasureTypeFromChart(context.dataset, 'number');
                const formattedValue = formatValue(value, measureType);
                return `${label}: ${formattedValue}`;
              },
            },
          },
          zoom: {
            pan: {
              enabled: true,
              mode: 'x', // Only pan horizontally
            },
            zoom: {
              wheel: {
                enabled: true,
                speed: 0.05,
              },
              pinch: {
                enabled: true,
              },
              mode: 'x', // Only zoom horizontally
            },
            limits: {
              x: { min: 'original', max: 'original' },
              'y-left': { min: 0, max: 'original' },
              'y-right': { min: 0, max: 'original' },
            },
          },
        },
        responsive: true,
        maintainAspectRatio: false,
      },
    };

    const newChart = new Chart(ctx, config);
    setChart(newChart);

    // Generate HTML legend
    if (legendRef.current) {
      const ul = legendRef.current;
      ul.innerHTML = '';

      const items = newChart.options.plugins?.legend?.labels?.generateLabels?.(newChart);

      // Calculate totals for each dataset
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
        const dataset = newChart.data.datasets[item.datasetIndex!];
        const measureType = (dataset as { measureType?: string }).measureType || 'number';
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

    return () => {
      newChart.destroy();
    };
  }, [isOpen, mounted, chartData, primaryAxisLabel, secondaryAxisLabel, darkMode]);

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
                chart_type: 'dual-axis',
                ...(chartConfig && { chart_config: chartConfig }),
              }}
              dimensionCharts={expandedData.charts}
              onCollapse={handleCollapseDimension}
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
