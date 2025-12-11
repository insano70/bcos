'use client';

/**
 * Progress Bar Fullscreen Modal
 *
 * Displays progress bar charts in fullscreen with dimension expansion support.
 * Follows same pattern as ChartFullscreenModal but adapted for progress bars.
 */

import { useState, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import AnalyticsProgressBarChart from './analytics-progress-bar-chart';
import { useDimensionExpansion } from '@/hooks/useDimensionExpansion';
import { useChartFullscreen } from '@/hooks/useChartFullscreen';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import type {
  DimensionExpansionChartConfig,
  DimensionExpansionFilters,
} from '@/lib/types/dimensions';
import { DimensionCheckboxes } from './dimension-checkboxes';
import { DimensionValueSelector } from './dimension-value-selector';
import DimensionComparisonView from './dimension-comparison-view';

interface ProgressBarFullscreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  chartTitle: string;
  data: Array<{ label: string; value: number; percentage: number }>;
  colorPalette?: string;
  measureType?: string;
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

export default function ProgressBarFullscreenModal({
  isOpen,
  onClose,
  chartTitle,
  data,
  colorPalette = 'default',
  measureType = 'number',
  chartDefinitionId,
  finalChartConfig,
  runtimeFilters,
  onNextChart,
  onPreviousChart,
  canGoNext,
  canGoPrevious,
  chartPosition,
}: ProgressBarFullscreenModalProps) {
  // Phase 1: Toggle between simple (dimension-level) and advanced (value-level) selection
  const [useAdvancedSelection, setUseAdvancedSelection] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Use shared hook for modal lifecycle (mounting, scroll lock, escape key)
  const { mounted } = useChartFullscreen(isOpen, onClose);

  // Mobile detection for swipe navigation
  const isMobile = useIsMobile();

  // Swipe gesture for mobile navigation
  const swipeHandlers = useSwipeGesture({
    onSwipeUp: canGoNext ? onNextChart : undefined,
    onSwipeDown: canGoPrevious ? onPreviousChart : undefined,
    onSwipeLeft: onClose,
    onSwipeRight: onClose,
  });

  const dimension = useDimensionExpansion({
    chartDefinitionId,
    finalChartConfig,
    runtimeFilters,
    isOpen,
  });

  // Handle clicks outside modal
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
      aria-labelledby={titleId}
    >
      <div className="relative bg-white dark:bg-gray-900 rounded-lg w-full h-full sm:h-[90vh] sm:max-w-6xl flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex flex-col gap-3 px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          {/* Title row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                {chartTitle}
              </h2>
              {/* Position indicator for mobile navigation */}
              {chartPosition && (
                <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {chartPosition}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
              aria-label="Close fullscreen view"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
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
        </div>

        {/* Content - swipe handlers for mobile navigation */}
        <div
          className="flex-1 overflow-hidden"
          {...(isMobile ? swipeHandlers : {})}
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
                chart_type: 'progress-bar',
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

          {/* Show normal progress bar if not in dimension mode */}
          {!dimension.expandedData && (
            <div className="w-full h-full overflow-y-auto p-6">
              <AnalyticsProgressBarChart
                data={data}
                colorPalette={colorPalette}
                measureType={measureType}
                height={window.innerHeight * 0.75}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

