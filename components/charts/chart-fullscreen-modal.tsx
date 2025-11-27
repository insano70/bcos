/**
 * Chart Fullscreen Modal (Refactored)
 *
 * Slim orchestrator component that coordinates specialized hooks and components.
 * Reduced from 673 lines to ~200 lines through extraction of concerns.
 *
 * Responsibilities:
 * - Modal UI structure and layout
 * - Coordinate hooks and components
 * - Handle user interactions (clicks, overlay)
 *
 * Single Responsibility: UI shell and coordination only
 */

'use client';

import { useId, useRef, useMemo, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from 'next-themes';
import type { Chart, ChartTypeRegistry } from 'chart.js';
import type { ChartData } from '@/lib/types/analytics';
import type {
  DimensionExpansionChartConfig,
  DimensionExpansionFilters,
} from '@/lib/types/dimensions';
import { useChartFullscreen } from '@/hooks/useChartFullscreen';
import { useDimensionExpansion } from '@/hooks/useDimensionExpansion';
import { useChartInstance } from '@/hooks/useChartInstance';
import {
  buildChartOptions,
  type FullscreenChartType,
  type StackingMode,
} from '@/lib/utils/chart-fullscreen-config';
import { createPeriodComparisonHtmlLegend } from '@/lib/utils/period-comparison-legend';
import ChartLegend from './ChartLegend';
import { DimensionCheckboxes } from './dimension-checkboxes';
import { DimensionValueSelector } from './dimension-value-selector';
import DimensionComparisonView from './dimension-comparison-view';
import 'chartjs-adapter-moment';

/**
 * Props for ChartFullscreenModal
 */
interface ChartFullscreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  chartTitle: string;
  chartData: ChartData;
  chartType: FullscreenChartType;
  frequency?: string;
  stackingMode?: StackingMode;
  chartDefinitionId?: string;
  // For dimension expansion: configs from batch API
  finalChartConfig?: DimensionExpansionChartConfig;
  runtimeFilters?: DimensionExpansionFilters;
}

/**
 * Chart Fullscreen Modal Component
 *
 * Displays charts in fullscreen with zoom, pan, dimension expansion, and legend.
 * Uses custom hooks for separation of concerns.
 */
export default function ChartFullscreenModal({
  isOpen,
  onClose,
  chartTitle,
  chartData,
  chartType,
  frequency = 'Monthly',
  stackingMode = 'normal',
  chartDefinitionId,
  finalChartConfig,
  runtimeFilters,
}: ChartFullscreenModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const legendRef = useRef<HTMLUListElement>(null);
  const { theme } = useTheme();
  const chartTitleId = useId();

  // Phase 1: Toggle between simple (dimension-level) and advanced (value-level) selection
  const [useAdvancedSelection, setUseAdvancedSelection] = useState(false);

  // Use custom hooks for separation of concerns
  const { mounted } = useChartFullscreen(isOpen, onClose);

  const dimension = useDimensionExpansion({
    chartDefinitionId,
    finalChartConfig,
    runtimeFilters,
    isOpen,
  });

  // Build chart options using pure functions
  const chartOptions = useMemo(
    () =>
      buildChartOptions({
        chartType,
        chartData,
        frequency,
        stackingMode,
        darkMode: theme === 'dark',
      }),
    [chartType, chartData, frequency, stackingMode, theme]
  );

  // Manage Chart.js instance
  const { chart, resetZoom } = useChartInstance({
    canvasRef,
    chartData,
    chartType,
    chartOptions,
    isOpen,
    expandedData: dimension.expandedData,
    mounted,
  });

  // Check if this is period comparison data (for legend rendering)
  const hasPeriodComparison = chartData.datasets.some(
    (ds) => ds.label?.includes('Current Period') || ds.label?.includes('Previous Period')
  );

  // Generate period comparison legend (legacy DOM manipulation)
  useEffect(() => {
    if (chart && legendRef.current && hasPeriodComparison) {
      const ul = legendRef.current;
      ul.innerHTML = '';
      createPeriodComparisonHtmlLegend(chart as Chart<keyof ChartTypeRegistry>, ul, {});
    }
  }, [chart, hasPeriodComparison]);

  /**
   * Handle overlay click to close modal
   */
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Don't render until mounted (for portal)
  if (!isOpen || !mounted) {
    return null;
  }

  const modalContent = (
    <div
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
              className="font-semibold text-gray-800 dark:text-gray-100 text-lg"
            >
              {chartTitle}
            </h2>
            <div className="flex items-center gap-2">
              {/* Reset Zoom button (only show when not in dimension view) */}
              {!dimension.expandedData && (
                <button
                  type="button"
                  onClick={resetZoom}
                  className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md transition-colors"
                  aria-label="Reset zoom level"
                >
                  Reset Zoom
                </button>
              )}

              {/* Close button */}
              <button
                type="button"
                onClick={onClose}
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
                    // Advanced value-level selector
                    <DimensionValueSelector
                      dimensionsWithValues={dimension.dimensionsWithValues}
                      onApply={dimension.expandByValueSelections}
                      appliedSelections={dimension.appliedValueSelections}
                      isLoading={dimension.loading}
                      isDimensionsLoading={dimension.valuesLoading}
                      compact
                    />
                  ) : (
                    // Simple dimension-level checkboxes
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

        {/* Chart Content */}
        <div className={`flex-1 p-6 ${dimension.expandedData ? 'overflow-hidden' : 'overflow-auto'}`}>
          {/* Dimension error message */}
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
                chart_type: chartType,
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
              <div className="w-full h-[calc(90vh-200px)] min-h-[400px]">
                <canvas ref={canvasRef} />
              </div>

              {/* Legend - now declarative! */}
              {hasPeriodComparison ? (
                // Period comparison legend uses legacy DOM manipulation
                // Keep the ul ref for backwards compatibility
                <div className="mt-4">
                  <ul
                    ref={legendRef}
                    className="flex flex-wrap gap-x-6 gap-y-2 max-h-60 overflow-y-auto px-2 py-1"
                  />
                </div>
              ) : (
                // Standard legend uses new declarative component
                <ChartLegend
                  chart={chart}
                  chartData={chartData}
                  hasPeriodComparison={hasPeriodComparison}
                  frequency={frequency}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
