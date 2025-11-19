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

// Position config type
interface ChartPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DimensionComparisonViewProps {
  dimension: ExpansionDimension;
  chartDefinition: {
    chart_definition_id: string;
    chart_name: string;
    chart_type: string;
    chart_config?: Record<string, unknown>;
  };
  dimensionCharts: DimensionExpandedChart[];
  position: ChartPosition;
}

export default function DimensionComparisonView({
  dimension,
  chartDefinition,
  dimensionCharts,
  position,
}: DimensionComparisonViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

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

  return (
    <div className="relative bg-white dark:bg-gray-800 shadow-sm rounded-xl border border-gray-200 dark:border-gray-700">
      {/* Compact info bar - No close button (parent modal has it) */}
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Expanded by {dimension.displayName} • {dimensionCharts.length} values
        </p>
      </div>

      {/* Scroll indicators (mobile) */}
      {dimensionCharts.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 py-2 lg:hidden">
          {dimensionCharts.map((dimensionChart, index) => (
            <div
              key={`mobile-indicator-${dimensionChart.dimensionValue.value}`}
              className={`h-1.5 rounded-full transition-all ${
                index === currentIndex
                  ? 'w-6 bg-violet-600'
                  : 'w-1.5 bg-gray-300 dark:bg-gray-600'
              }`}
            />
          ))}
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
          {dimensionCharts.map((dimensionChart) => (
            <div
              key={`${dimension.columnName}-${dimensionChart.dimensionValue.value}`}
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
          ))}
        </div>
      </div>

      {/* Desktop scroll indicators */}
      {dimensionCharts.length > 2 && (
        <div className="hidden lg:flex items-center justify-center gap-2 py-3 border-t border-gray-200 dark:border-gray-700">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {currentIndex + 1} of {dimensionCharts.length}
          </span>
          <div className="flex gap-1">
            {dimensionCharts.map((dimensionChart, index) => (
              <button
                key={`desktop-indicator-${dimensionChart.dimensionValue.value}`}
                type="button"
                onClick={() => {
                  const container = scrollContainerRef.current;
                  const chartWidth = container?.querySelector('.dimension-chart')?.clientWidth || 0;
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
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

