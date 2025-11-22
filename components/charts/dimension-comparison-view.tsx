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

// Position config type
interface ChartPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DimensionComparisonViewProps {
  dimension: ExpansionDimension | ExpansionDimension[]; // Support both single and multi-dimension
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
}

export default function DimensionComparisonView({
  dimension,
  chartDefinition,
  dimensionCharts,
  position,
  availableDimensions,
  selectedDimensionColumns,
  onApplyDimensions,
  isApplying = false,
}: DimensionComparisonViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(CHARTS_PER_PAGE);
  const [localSelectedColumns, setLocalSelectedColumns] = useState<string[]>(
    selectedDimensionColumns || []
  );

  // Reset visible count when dimensionCharts changes
  useEffect(() => {
    setVisibleCount(CHARTS_PER_PAGE);
  }, [dimensionCharts]);

  // Sync local selected columns with prop changes
  useEffect(() => {
    if (selectedDimensionColumns) {
      setLocalSelectedColumns(selectedDimensionColumns);
    }
  }, [selectedDimensionColumns]);

  // Handle dimension checkbox toggle
  const handleDimensionToggle = (columnName: string) => {
    setLocalSelectedColumns((prev) => {
      if (prev.includes(columnName)) {
        // Deselect (but keep at least one selected)
        if (prev.length > 1) {
          return prev.filter((col) => col !== columnName);
        }
        return prev;
      } else {
        // Select (max 3 dimensions)
        if (prev.length < 3) {
          return [...prev, columnName];
        }
        return prev;
      }
    });
  };

  // Handle Apply button click
  const handleApply = () => {
    if (!availableDimensions || !onApplyDimensions) return;
    const selectedDimensions = availableDimensions.filter((dim) =>
      localSelectedColumns.includes(dim.columnName)
    );
    onApplyDimensions(selectedDimensions);
  };

  // Check if selection has changed
  const hasSelectionChanged =
    selectedDimensionColumns &&
    (localSelectedColumns.length !== selectedDimensionColumns.length ||
      !localSelectedColumns.every((col) => selectedDimensionColumns.includes(col)));

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

  const baseHeight = position.h * DASHBOARD_LAYOUT.CHART.HEIGHT_MULTIPLIER;
  const containerHeight = Math.max(baseHeight, DASHBOARD_LAYOUT.CHART.MIN_HEIGHT);

  // Format dimension names for display
  const dimensionNames = Array.isArray(dimension)
    ? dimension.map((d) => d.displayName).join(', ')
    : dimension.displayName;

  // Determine label type (single dimension: "values", multi-dimension: "combinations")
  const labelType = Array.isArray(dimension) ? 'combinations' : 'values';

  return (
    <div className="relative bg-white dark:bg-gray-800 shadow-sm rounded-xl border border-gray-200 dark:border-gray-700">
      {/* Compact info bar with inline dimension selection */}
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
        {/* Dimension checkboxes and Apply button (if enabled) */}
        {availableDimensions && availableDimensions.length > 1 && onApplyDimensions && (
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            {/* Dimension checkboxes */}
            <div className="flex items-center gap-3 flex-wrap">
              {availableDimensions.map((dim) => (
                <label
                  key={dim.columnName}
                  className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-700 dark:text-gray-300"
                >
                  <input
                    type="checkbox"
                    checked={localSelectedColumns.includes(dim.columnName)}
                    onChange={() => handleDimensionToggle(dim.columnName)}
                    disabled={isApplying}
                    className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-violet-600 focus:ring-violet-500 focus:ring-offset-0 focus:ring-2 disabled:opacity-50"
                  />
                  <span className="select-none">{dim.displayName}</span>
                </label>
              ))}
            </div>
            {/* Apply button */}
            <button
              type="button"
              onClick={handleApply}
              disabled={!hasSelectionChanged || isApplying}
              className="px-3 py-1 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700
                       rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isApplying ? 'Applying...' : 'Apply'}
            </button>
          </div>
        )}
        {/* Status text */}
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Expanded by {dimensionNames} • Showing {visibleCount} of {dimensionCharts.length} {labelType}
        </p>
      </div>

      {/* Scroll indicators (mobile) */}
      {visibleCharts.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 py-2 lg:hidden">
          {visibleCharts.map((dimensionChart, index) => {
            // Generate unique key for mobile indicators
            const dimensionValue = dimensionChart.dimensionValue;
            const mobileIndicatorKey =
              'value' in dimensionValue
                ? `mobile-indicator-${dimensionValue.value}`
                : `mobile-indicator-${Object.values(dimensionValue.values).join('-')}`;

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
          {visibleCharts.map((dimensionChart, index) => {
            // Generate unique key for both single and multi-dimension cases
            const dimensionValue = dimensionChart.dimensionValue;
            const uniqueKey =
              'value' in dimensionValue
                ? `chart-${index}-${dimensionValue.value}`
                : `chart-${index}-${Object.values(dimensionValue.values).join('-')}`;

            return (
              <div
                key={uniqueKey}
                className="dimension-chart flex-shrink-0"
                style={{
                  scrollSnapAlign: 'start',
                  width: 'min(90vw, 500px)',
                }}
              >
                {/* Dimension value label - Compact for mobile optimization */}
                <div className="mb-1.5 px-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {dimensionChart.dimensionValue.label}
                    </div>
                    {dimensionChart.dimensionValue.recordCount !== undefined && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                        {dimensionChart.dimensionValue.recordCount.toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>

              {/* Chart or Error State - No header, maximized space for data visualization */}
              <div
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                style={{
                  height: `${containerHeight - 30}px`,
                  maxHeight: `${containerHeight - 30}px`,
                  overflow: 'hidden',
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

      {/* Show More button */}
      {hasMore && (
        <div className="flex items-center justify-center py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={handleShowMore}
            className="px-6 py-2 text-sm font-medium text-violet-700 dark:text-violet-300
                     bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/30
                     rounded-lg transition-colors border border-violet-200 dark:border-violet-700"
          >
            Show More (+{Math.min(CHARTS_PER_PAGE, dimensionCharts.length - visibleCount)})
          </button>
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

