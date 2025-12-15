'use client';

/**
 * Dimension Comparison View
 *
 * Renders side-by-side charts for dimension expansion.
 * Displays one chart per dimension value in a horizontal scroll container.
 *
 * Features:
 * - Horizontal scroll with snap points
 * - Touch-friendly mobile scrolling
 * - Dimension value labels
 * - Collapse button
 * - Scroll position indicators
 * - Responsive sizing
 */

import { useRef, useEffect, useState } from 'react';
import type { DimensionExpandedChart, ExpansionDimension } from '@/lib/types/dimensions';
import BatchChartRenderer from './batch-chart-renderer';
import { DASHBOARD_LAYOUT } from '@/lib/constants/dashboard-layout';
import { CHARTS_PER_PAGE } from '@/lib/constants/dimension-expansion';
import { Spinner } from '@/components/ui/spinner';

// Position config type
interface ChartPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Loading skeleton for dimension chart cards
 */
function ChartSkeleton({ height }: { height: number }) {
  return (
    <div
      className="flex-shrink-0 animate-pulse overflow-hidden rounded-lg"
      style={{
        width: 'min(90vw, 500px)',
      }}
    >
      {/* Label skeleton */}
      <div className="mb-1.5 px-1">
        <div className="flex items-baseline justify-between gap-2 min-w-0">
          <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded flex-shrink-0" />
        </div>
      </div>
      
      {/* Chart skeleton */}
      <div
        className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden"
        style={{ height: `${height - 30}px` }}
      >
        <div className="h-full flex flex-col p-4">
          {/* Chart area skeleton */}
          <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-lg mb-4" />
          {/* Legend skeleton */}
          <div className="flex gap-4 justify-center">
            <div className="h-3 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

interface DimensionComparisonViewProps {
  dimensions: ExpansionDimension[]; // Always array now
  chartDefinition: {
    chart_definition_id: string;
    chart_name: string;
    chart_type: string;
    chart_config?: Record<string, unknown>;
  };
  dimensionCharts: DimensionExpandedChart[];
  position: ChartPosition;
  // Inline dimension selection
  availableDimensions?: ExpansionDimension[];
  selectedDimensionColumns?: string[];
  onApplyDimensions?: (dimensions: ExpansionDimension[]) => void;
  isApplying?: boolean;
  // Server-side load more
  hasMoreFromServer?: boolean;
  onLoadMore?: () => Promise<void>;
  isLoadingMore?: boolean;
  // Loading state for initial expansion
  isLoading?: boolean;
  // Total combinations available (from server metadata)
  totalCombinations?: number | undefined;
  // Fullscreen mode - uses viewport-based height instead of position-based
  fullscreen?: boolean;
}

export default function DimensionComparisonView({
  dimensions: _dimensions = [],
  chartDefinition,
  dimensionCharts = [],
  position,
  availableDimensions: _availableDimensions,
  selectedDimensionColumns: _selectedDimensionColumns,
  onApplyDimensions: _onApplyDimensions,
  isApplying: _isApplying = false,
  hasMoreFromServer = false,
  onLoadMore,
  isLoadingMore = false,
  isLoading = false,
  totalCombinations: _totalCombinations,
  fullscreen = false,
}: DimensionComparisonViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(CHARTS_PER_PAGE);
  // Reset visible count when dimensionCharts changes
  useEffect(() => {
    setVisibleCount(CHARTS_PER_PAGE);
  }, [dimensionCharts]);

  // Slice charts to show only visible ones (pagination)
  const visibleCharts = dimensionCharts.slice(0, visibleCount);
  const hasMore = visibleCount < dimensionCharts.length;

  const handleShowMore = () => {
    setVisibleCount((prev) => Math.min(prev + CHARTS_PER_PAGE, dimensionCharts.length));
  };

  // Track scroll position for indicators
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollLeft = container.scrollLeft;
      const chartWidth = container.querySelector('.dimension-chart')?.clientWidth || 0;
      const index = Math.round(scrollLeft / chartWidth);
      setCurrentIndex(index);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // In fullscreen mode, use viewport-based height to fit modal
  // Header takes ~120px, padding ~48px, indicators ~40px, leaving ~75vh for charts
  const fullscreenHeight = typeof window !== 'undefined' ? Math.floor(window.innerHeight * 0.65) : 500;
  const baseHeight = fullscreen ? fullscreenHeight : position.h * DASHBOARD_LAYOUT.CHART.HEIGHT_MULTIPLIER;
  const containerHeight = Math.max(baseHeight, DASHBOARD_LAYOUT.CHART.MIN_HEIGHT);

  return (
    <div className="relative bg-gray-50 dark:bg-gray-900/50 shadow-sm rounded-xl overflow-hidden">
      {/* Scroll indicators (mobile) */}
      {visibleCharts.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 py-2 lg:hidden">
          {visibleCharts.map((dimensionChart, index) => {
            // Generate unique key for mobile indicators
            const dimensionValue = dimensionChart.dimensionValue;
            const mobileIndicatorKey = `mobile-indicator-${Object.values(dimensionValue.values).join('-')}`;

            return (
              <div
                key={mobileIndicatorKey}
                className={`h-1.5 rounded-full transition-all ${
                  index === currentIndex
                    ? 'w-6 bg-violet-600'
                    : 'w-1.5 bg-gray-300 dark:bg-gray-600'
                }`}
              />
            );
          })}
        </div>
      )}

      {/* Horizontal scroll container */}
      <div
        ref={scrollContainerRef}
        className="overflow-x-auto overflow-y-hidden scroll-smooth"
        style={{
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div className="flex gap-4 p-4" style={{ minWidth: 'min-content' }}>
          {/* Show skeletons when loading */}
          {isLoading && dimensionCharts.length === 0 &&
            [1, 2, 3].map((i) => (
              <ChartSkeleton key={`skeleton-${i}`} height={containerHeight} />
            ))
          }
          
          {/* Show actual charts */}
          {visibleCharts.map((dimensionChart, index) => {
            // Generate unique key for charts
            const dimensionValue = dimensionChart.dimensionValue;
            const uniqueKey = `chart-${index}-${Object.values(dimensionValue.values).join('-')}`;

            return (
              <div
                key={uniqueKey}
                className="dimension-chart flex-shrink-0 overflow-hidden rounded-lg"
                style={{
                  scrollSnapAlign: 'start',
                  width: 'min(90vw, 500px)',
                }}
              >
                {/* Dimension value label - Compact for mobile optimization */}
                <div className="mb-1.5 px-1">
                  <div className="flex items-baseline justify-between gap-2 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate min-w-0 flex-1">
                      {dimensionChart.dimensionValue.label}
                    </div>
                    {dimensionChart.dimensionValue.recordCount !== undefined && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 whitespace-nowrap">
                        {dimensionChart.dimensionValue.recordCount.toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>

              {/* Chart or Error State - No header, maximized space for data visualization */}
              <div
                className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden"
                style={{
                  height: `${containerHeight - 30}px`,
                  maxHeight: `${containerHeight - 30}px`,
                }}
              >
                {dimensionChart.error ? (
                  // Error state
                  <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                    <div className="text-red-500 dark:text-red-400 mb-2">
                      <svg
                        className="w-12 h-12 mx-auto"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                      {dimensionChart.error.message}
                    </p>
                    {dimensionChart.error.details && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {dimensionChart.error.details}
                      </p>
                    )}
                  </div>
                ) : dimensionChart.chartData ? (
                  // Success state
                  <BatchChartRenderer
                    chartData={dimensionChart.chartData}
                    chartDefinition={chartDefinition}
                    position={position}
                    className="w-full h-full"
                    responsive={true}
                    minHeight={DASHBOARD_LAYOUT.CHART.MIN_HEIGHT_WITH_PADDING}
                    maxHeight={containerHeight - 30}
                    hideHeader={true}
                  />
                ) : (
                  // Fallback for null chartData without error (shouldn't happen)
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm text-gray-500 dark:text-gray-400">No data available</p>
                  </div>
                )}
              </div>
            </div>
            );
          })}
        </div>
      </div>

      {/* Show More buttons - client-side pagination and server-side load more */}
      {(hasMore || hasMoreFromServer) && (
        <div className="flex items-center justify-center gap-4 py-4 border-t border-gray-200 dark:border-gray-700">
          {/* Client-side: Show more from already loaded charts */}
          {hasMore && (
            <button
              type="button"
              onClick={handleShowMore}
              className="px-6 py-2 text-sm font-medium text-violet-700 dark:text-violet-300
                       bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/30
                       rounded-lg transition-colors border border-violet-200 dark:border-violet-700"
            >
              Show More (+{Math.min(CHARTS_PER_PAGE, dimensionCharts.length - visibleCount)})
            </button>
          )}
          
          {/* Server-side: Load more from API (when all local charts shown) */}
          {!hasMore && hasMoreFromServer && onLoadMore && (
            <button
              type="button"
              onClick={onLoadMore}
              disabled={isLoadingMore}
              className="px-6 py-2 text-sm font-medium text-white
                       bg-violet-600 hover:bg-violet-700
                       rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                       flex items-center gap-2"
            >
              {isLoadingMore ? (
                <>
                  <Spinner
                    sizeClassName="w-4 h-4"
                    borderClassName="border-2"
                    trackClassName="border-current opacity-25"
                    indicatorClassName="border-current opacity-75"
                  />
                  Loading...
                </>
              ) : (
                'Load More Values'
              )}
            </button>
          )}
        </div>
      )}

      {/* Desktop scroll indicators */}
      {visibleCharts.length > 2 && (
        <div className="hidden lg:flex items-center justify-center gap-2 py-3 border-t border-gray-200 dark:border-gray-700">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {currentIndex + 1} of {visibleCharts.length}
          </span>
          <div className="flex gap-1">
            {visibleCharts.map((dimensionChart, index) => {
              // Generate unique key for desktop indicators
              const dimensionValue = dimensionChart.dimensionValue;
              const indicatorKey =
                'value' in dimensionValue
                  ? `desktop-indicator-${dimensionValue.value}`
                  : `desktop-indicator-${Object.values(dimensionValue.values).join('-')}`;

              return (
                <button
                  key={indicatorKey}
                  type="button"
                  onClick={() => {
                    const container = scrollContainerRef.current;
                    const chartWidth =
                      container?.querySelector('.dimension-chart')?.clientWidth || 0;
                    container?.scrollTo({
                      left: chartWidth * index,
                      behavior: 'smooth',
                    });
                  }}
                  className={`w-2 h-2 rounded-full transition-all ${
                    index === currentIndex
                      ? 'bg-violet-600'
                      : 'bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500'
                  }`}
                  aria-label={`Go to ${dimensionChart.dimensionValue.label}`}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

