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
  onCollapse: () => void;
  position: ChartPosition;
}

export default function DimensionComparisonView({
  dimension,
  chartDefinition,
  dimensionCharts,
  onCollapse,
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
      {/* Header with dimension label and collapse button */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {chartDefinition.chart_name}
          </h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Expanded by {dimension.displayName} • {dimensionCharts.length} values
          </p>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 
                   rounded-lg transition-colors"
          title="Collapse to single chart"
          aria-label="Collapse dimension expansion"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
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
              {/* Dimension value label */}
              <div className="mb-2 px-2">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {dimensionChart.dimensionValue.label}
                </div>
                {dimensionChart.dimensionValue.recordCount !== undefined && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {dimensionChart.dimensionValue.recordCount.toLocaleString()} records
                  </div>
                )}
              </div>

              {/* Chart */}
              <div
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                style={{
                  height: `${containerHeight - 60}px`,
                  maxHeight: `${containerHeight - 60}px`,
                  overflow: 'hidden',
                }}
              >
                <BatchChartRenderer
                  // biome-ignore lint/suspicious/noExplicitAny: ChartRenderResult structure matches BatchChartData
                  chartData={dimensionChart.chartData as any}
                  chartDefinition={chartDefinition}
                  position={position}
                  className="w-full h-full"
                  responsive={true}
                  minHeight={DASHBOARD_LAYOUT.CHART.MIN_HEIGHT_WITH_PADDING}
                  maxHeight={containerHeight - 80}
                />
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

