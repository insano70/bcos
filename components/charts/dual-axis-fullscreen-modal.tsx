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
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { chartColors } from '@/components/charts/chartjs-config';
import type { ChartData } from '@/lib/types/analytics';
import { formatValue, formatValueCompact } from '@/lib/utils/chart-data/formatters/value-formatter';
import { getMeasureTypeFromChart } from '@/lib/utils/type-guards';
import { useDimensionExpansion } from '@/hooks/useDimensionExpansion';
import { useChartFullscreen } from '@/hooks/useChartFullscreen';
import { useIsMobile } from '@/hooks/useIsMobile';
import type {
  DimensionExpansionChartConfig,
  DimensionExpansionFilters,
} from '@/lib/types/dimensions';
import { DimensionCheckboxes } from './dimension-checkboxes';
import { DimensionValueSelector } from './dimension-value-selector';
import DimensionComparisonView from './dimension-comparison-view';
import FullscreenModalFooter from './fullscreen-modal-footer';
import { ScrollableLegendContainer } from '@/components/ui/scrollable-legend';

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
  // For dimension expansion: configs from batch API
  finalChartConfig?: DimensionExpansionChartConfig;
  runtimeFilters?: DimensionExpansionFilters;
  // Mobile navigation support (swipe between charts)
  onNextChart?: () => void;
  onPreviousChart?: () => void;
  canGoNext?: boolean;
  canGoPrevious?: boolean;
  /** Position indicator, e.g., "3 of 8" */
  chartPosition?: string;
}

export default function DualAxisFullscreenModal({
  isOpen,
  onClose,
  chartTitle,
  chartData,
  primaryAxisLabel,
  secondaryAxisLabel,
  chartDefinitionId,
  finalChartConfig,
  runtimeFilters,
  onNextChart,
  onPreviousChart,
  canGoNext,
  canGoPrevious,
  chartPosition,
}: DualAxisFullscreenModalProps) {
  const [chart, setChart] = useState<ChartType | null>(null);
  // Phase 1: Toggle between simple (dimension-level) and advanced (value-level) selection
  const [useAdvancedSelection, setUseAdvancedSelection] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const legendRef = useRef<HTMLUListElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const darkMode = theme === 'dark';

  const chartTitleId = useId();

  // Use shared hook for modal lifecycle (mounting, scroll lock, escape key)
  const { mounted } = useChartFullscreen(isOpen, onClose);

  // Mobile detection for hiding Reset Zoom when dimension controls visible
  const isMobile = useIsMobile();

  const dimension = useDimensionExpansion({
    chartDefinitionId,
    finalChartConfig,
    runtimeFilters,
    isOpen,
  });

  // Callback ref to ensure canvas is mounted
  const setCanvasRef = (element: HTMLCanvasElement | null) => {
    canvasRef.current = element;
  };

  // Register Chart.js plugins once
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
  }, []);

  // Initialize chart (reinitialize when collapsing from dimension expansion)
  useEffect(() => {
    if (!isOpen || !canvasRef.current || !chartData || dimension.expandedData) return;

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
  }, [isOpen, mounted, chartData, primaryAxisLabel, secondaryAxisLabel, darkMode, dimension.expandedData]);

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
        <header className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex flex-col gap-3 flex-shrink-0">
          {/* Title row */}
          <div className="flex items-center justify-between">
            <h2
              id={chartTitleId}
              className="font-semibold text-gray-800 dark:text-gray-100 text-lg truncate"
            >
              {chartTitle}
            </h2>
            <div className="flex items-center gap-2">
              {/* Reset Zoom button - hide when in dimension view or on mobile with dimension controls visible */}
              {!dimension.expandedData && !(isMobile && dimension.canExpand) && (
                <button
                  type="button"
                  onClick={handleResetZoom}
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
          </div>

          {/* Dimension selection row - simple or advanced mode */}
          {dimension.canExpand && (
            <div className="space-y-2">
              {/* Controls row: Toggle button on left, then selector */}
              <div className="flex items-center gap-2">
                {/* Show/Hide Filters toggle button */}
                <button
                  type="button"
                  onClick={() => setUseAdvancedSelection(!useAdvancedSelection)}
                  className={`
                    px-3 py-1 text-xs font-medium rounded-md transition-colors
                    ${useAdvancedSelection
                      ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-300 dark:border-violet-600'
                      : 'text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-600 hover:border-violet-300 dark:hover:border-violet-500'
                    }
                  `}
                  title={useAdvancedSelection ? 'Hide value-level filters' : 'Show value-level filters'}
                >
                  {useAdvancedSelection ? 'Hide Filters' : 'Show Filters'}
                </button>

                {/* Dimension selector */}
                <div className="flex-1">
                  {useAdvancedSelection ? (
                    <DimensionValueSelector
                      dimensionsWithValues={dimension.dimensionsWithValues}
                      onApply={dimension.expandByValueSelections}
                      appliedSelections={dimension.appliedValueSelections}
                      isLoading={dimension.loading}
                      isDimensionsLoading={dimension.valuesLoading}
                      compact
                    />
                  ) : (
                    <DimensionCheckboxes
                      availableDimensions={dimension.availableDimensions}
                      selectedColumns={dimension.selectedDimensionColumns}
                      onApply={dimension.selectDimensionsByColumns}
                      isLoading={dimension.loading}
                      isDimensionsLoading={dimension.dimensionsLoading}
                      showingCount={dimension.expandedData?.charts?.length}
                      totalCount={dimension.expandedData?.metadata?.totalCombinations}
                      compact
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </header>

        {/* Chart Content - no swipe handlers, free for interaction */}
        <div
          className={`flex-1 pt-3 px-6 pb-6 ${dimension.expandedData ? 'overflow-hidden' : 'overflow-auto'}`}
        >
          {dimension.error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
              {dimension.error}
            </div>
          )}

          {/* Show dimension comparison view if expanded or loading */}
          {(dimension.expandedData?.dimensions || dimension.loading) && (
            <DimensionComparisonView
              dimensions={dimension.expandedData?.dimensions || []}
              chartDefinition={{
                chart_definition_id: chartDefinitionId || '',
                chart_name: chartTitle,
                chart_type: 'dual-axis',
                ...(finalChartConfig && { chart_config: finalChartConfig }),
              }}
              dimensionCharts={dimension.expandedData?.charts || []}
              position={{ x: 0, y: 0, w: 12, h: 6 }}
              availableDimensions={dimension.availableDimensions}
              selectedDimensionColumns={dimension.selectedDimensionColumns}
              onApplyDimensions={dimension.selectDimensions}
              isApplying={dimension.loading}
              hasMoreFromServer={dimension.hasMore}
              onLoadMore={dimension.loadMore}
              isLoadingMore={dimension.loadingMore}
              isLoading={dimension.loading}
              totalCombinations={dimension.expandedData?.metadata?.totalCombinations}
              fullscreen={true}
            />
          )}

          {/* Show normal chart if not in dimension mode */}
          {!dimension.expandedData && (
            <>
              {/* Legend at TOP for consistency with other fullscreen modals */}
              <ScrollableLegendContainer maxHeight={64} className="mb-3">
                <ul
                  ref={legendRef}
                  className="flex flex-wrap gap-x-1 gap-y-0.5"
                />
              </ScrollableLegendContainer>

              <div className="w-full h-[calc(90vh-240px)] min-h-[400px]">
                <canvas ref={setCanvasRef} />
              </div>
            </>
          )}
        </div>

        {/* Footer with navigation */}
        <FullscreenModalFooter
          onNextChart={onNextChart}
          onPreviousChart={onPreviousChart}
          onClose={onClose}
          canGoNext={canGoNext}
          canGoPrevious={canGoPrevious}
          chartPosition={chartPosition}
        />
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
