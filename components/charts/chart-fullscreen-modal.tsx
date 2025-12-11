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
import type { Chart, ChartTypeRegistry, ChartEvent, ActiveElement } from 'chart.js';
import type { ChartData } from '@/lib/types/analytics';
import type {
  DimensionExpansionChartConfig,
  DimensionExpansionFilters,
} from '@/lib/types/dimensions';
import type { DrillDownConfig, DrillDownResult } from '@/lib/types/drill-down';
import { useChartFullscreen } from '@/hooks/useChartFullscreen';
import { useDimensionExpansion } from '@/hooks/useDimensionExpansion';
import { useChartInstance } from '@/hooks/useChartInstance';
import { useChartDrillDown } from '@/hooks/useChartDrillDown';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import {
  buildChartOptions,
  type FullscreenChartType,
  type StackingMode,
} from '@/lib/utils/chart-fullscreen-config';
import { createPeriodComparisonHtmlLegend } from '@/lib/utils/period-comparison-legend';
import { createChartClickHandler, getPrimaryFieldFromConfig, getSeriesFieldFromConfig } from '@/lib/utils/chart-click-handler';
import ChartLegend from './ChartLegend';
import { DimensionCheckboxes } from './dimension-checkboxes';
import { DimensionValueSelector } from './dimension-value-selector';
import DimensionComparisonView from './dimension-comparison-view';
import { DrillDownIcon } from './drill-down-icon';
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
  // Drill-down support
  drillDownConfig?: DrillDownConfig;
  onDrillDownExecute?: (result: DrillDownResult) => void;
  // Mobile navigation support (swipe between charts)
  onNextChart?: () => void;
  onPreviousChart?: () => void;
  canGoNext?: boolean;
  canGoPrevious?: boolean;
  /** Position indicator, e.g., "3 of 8" */
  chartPosition?: string;
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
  drillDownConfig,
  onDrillDownExecute,
  onNextChart,
  onPreviousChart,
  canGoNext,
  canGoPrevious,
  chartPosition,
}: ChartFullscreenModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const legendRef = useRef<HTMLUListElement>(null);
  const { theme } = useTheme();
  const chartTitleId = useId();

  // Phase 1: Toggle between simple (dimension-level) and advanced (value-level) selection
  const [useAdvancedSelection, setUseAdvancedSelection] = useState(false);

  // Mobile detection for drill-down UX
  const isMobile = useIsMobile();

  // Use custom hooks for separation of concerns
  const { mounted } = useChartFullscreen(isOpen, onClose);

  // Swipe gesture for mobile navigation
  const swipeHandlers = useSwipeGesture({
    onSwipeUp: canGoNext ? onNextChart : undefined,
    onSwipeDown: canGoPrevious ? onPreviousChart : undefined,
    onSwipeLeft: onClose,
    onSwipeRight: onClose,
  });

  // Drill-down hook (only when config provided)
  const drillDown = useChartDrillDown({
    drillDownConfig: drillDownConfig ?? null,
    onDrillDownExecute,
    immediateExecute: !isMobile,
  });

  const dimension = useDimensionExpansion({
    chartDefinitionId,
    finalChartConfig,
    runtimeFilters,
    isOpen,
  });

  // Create Chart.js click handler for drill-down
  const chartJsOnClick = useMemo(() => {
    if (!drillDownConfig?.enabled) {
      return undefined;
    }
    const configForField = finalChartConfig as { groupBy?: string; x_axis?: { field?: string }; seriesConfigs?: Array<{ groupBy?: string }>; series?: { groupBy?: string } } | undefined;
    const primaryField = getPrimaryFieldFromConfig(configForField);
    const seriesField = getSeriesFieldFromConfig(configForField);
    
    return createChartClickHandler({
      onElementClick: drillDown.handleElementClick,
      primaryField,
      ...(seriesField ? { seriesField } : {}),
    });
  }, [drillDownConfig?.enabled, finalChartConfig, drillDown.handleElementClick]);

  // Build chart options using pure functions
  const baseChartOptions = useMemo(
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

  // Merge drill-down click handler into options
  const chartOptions = useMemo(() => {
    if (!chartJsOnClick) {
      return baseChartOptions;
    }
    return {
      ...baseChartOptions,
      onClick: chartJsOnClick as (event: ChartEvent, elements: ActiveElement[], chart: Chart) => void,
    };
  }, [baseChartOptions, chartJsOnClick]);

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
            <div className="flex items-center gap-3 min-w-0">
              <h2
                id={chartTitleId}
                className="font-semibold text-gray-800 dark:text-gray-100 text-lg truncate"
              >
                {chartTitle}
              </h2>
              {/* Position indicator for mobile navigation */}
              {chartPosition && (
                <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {chartPosition}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Reset Zoom button - hide when in dimension view or on mobile with dimension controls visible */}
              {!dimension.expandedData && !(isMobile && dimension.canExpand) && (
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
              {/* items-end aligns all boxes to same horizontal line (labels float above) */}
              <div className="flex items-end gap-2">
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

        {/* Chart Content - swipe handlers for mobile navigation */}
        <div
          className={`flex-1 pt-3 px-6 pb-6 ${dimension.expandedData ? 'overflow-hidden' : 'overflow-auto'}`}
          {...(isMobile ? swipeHandlers : {})}
        >
          {/* Dimension error message */}
          {dimension.error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
              {dimension.error}
            </div>
          )}

          {/* Show dimension comparison view only when we have expanded data */}
          {dimension.expandedData?.dimensions && (
            <DimensionComparisonView
              dimensions={dimension.expandedData.dimensions}
              chartDefinition={{
                chart_definition_id: chartDefinitionId || '',
                chart_name: chartTitle,
                chart_type: chartType,
                ...(finalChartConfig && { chart_config: finalChartConfig }),
              }}
              dimensionCharts={dimension.expandedData.charts || []}
              position={{ x: 0, y: 0, w: 12, h: 6 }}
              availableDimensions={dimension.availableDimensions}
              selectedDimensionColumns={dimension.selectedDimensionColumns}
              onApplyDimensions={dimension.selectDimensions}
              isApplying={dimension.loading}
              hasMoreFromServer={dimension.hasMore}
              onLoadMore={dimension.loadMore}
              isLoadingMore={dimension.loadingMore}
              isLoading={false}
              totalCombinations={dimension.expandedData.metadata?.totalCombinations}
              fullscreen={true}
            />
          )}

          {/* Show normal chart if not in dimension mode (keep visible while loading) */}
          {!dimension.expandedData && (
            <>
              {/* Legend at TOP for consistency with dashboard view */}
              {hasPeriodComparison ? (
                // Period comparison legend uses legacy DOM manipulation
                <div className="mb-4">
                  <ul
                    ref={legendRef}
                    className="flex flex-wrap gap-x-6 gap-y-2 max-h-60 overflow-y-auto px-2 py-1"
                  />
                </div>
              ) : (
                // Standard legend uses declarative component
                <ChartLegend
                  chart={chart}
                  chartData={chartData}
                  hasPeriodComparison={hasPeriodComparison}
                  frequency={frequency}
                />
              )}

              <div className="relative w-full h-[calc(90vh-240px)] min-h-[400px]">
                <canvas ref={canvasRef} />
                
                {/* Loading overlay while dimension expansion is in progress */}
                {dimension.loading && (
                  <div className="absolute inset-0 bg-white/60 dark:bg-gray-800/60 flex items-center justify-center rounded-lg backdrop-blur-sm">
                    <div className="flex items-center gap-3 px-4 py-2 bg-white dark:bg-gray-700 rounded-lg shadow-lg">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-violet-600" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                        Expanding by {dimension.selectedDimensionColumns
                          .map(col => dimension.availableDimensions.find(d => d.columnName === col)?.displayName || col)
                          .join(', ') || 'dimension'}...
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Drill-Down Icon - Mobile only */}
              {drillDownConfig?.enabled && isMobile && (
                <DrillDownIcon
                  isVisible={drillDown.showDrillDownIcon}
                  position={drillDown.iconPosition}
                  label={drillDownConfig.buttonLabel}
                  onClick={drillDown.executeDrillDown}
                  onDismiss={drillDown.dismissIcon}
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
