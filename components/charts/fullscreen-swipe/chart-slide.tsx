'use client';

/**
 * Chart Slide Component
 *
 * Individual chart slide in swipe mode.
 *
 * KEY DECISION: Uses BatchChartRenderer instead of custom ChartTypeDispatcher
 *
 * Why BatchChartRenderer:
 * - Already handles ALL chart types (bar, line, dual-axis, progress-bar, etc.)
 * - Already handles specialized fullscreen modals
 * - Already handles drill-down functionality
 * - Already handles dimension expansion
 * - Eliminates need for custom chart-type-dispatcher.tsx
 *
 * See batch-chart-renderer.tsx lines 516-577 for modal handling.
 */

import { useState, useEffect } from 'react';
import BatchChartRenderer from '@/components/charts/batch-chart-renderer';
import { ChartSkeleton } from '@/components/ui/loading-skeleton';
import ChartError from '../chart-error';
// Import existing types - DO NOT recreate
import type { DashboardChartEntry } from '@/lib/types/dashboard-config';
import type { BatchChartData } from '@/lib/services/dashboard-rendering/mappers';

interface ChartSlideProps {
  /** Chart configuration from dashboard */
  chart: DashboardChartEntry;
  /** Chart data from batch fetch */
  chartData: BatchChartData | null;
  /** Whether this is the currently visible chart */
  isActive: boolean;
  /** Whether this chart is adjacent to the active chart */
  isAdjacent: boolean;
  /** Whether chart data is loading */
  isLoading: boolean;
  /** Error message if data fetch failed */
  error: string | null;
}

export default function ChartSlide({
  chart,
  chartData,
  isActive,
  isAdjacent,
  isLoading,
  error,
}: ChartSlideProps) {
  const [shouldRender, setShouldRender] = useState(false);

  // Lazy load: only render if active or adjacent
  useEffect(() => {
    if (isActive || isAdjacent) {
      setShouldRender(true);
    }
  }, [isActive, isAdjacent]);

  return (
    <div className="chart-slide flex flex-col p-safe">
      {/* Chart content - BatchChartRenderer provides its own header */}
      <div className="flex-1 flex items-center justify-center p-4 md:p-6">
        {!shouldRender ? (
          <ChartSkeleton />
        ) : isLoading ? (
          <ChartSkeleton />
        ) : error ? (
          <ChartError error={error} />
        ) : !chartData ? (
          <ChartError error="Chart data not available" />
        ) : (
          <div className="w-full h-full max-w-5xl">
            {/*
              BatchChartRenderer handles:
              - All chart types via ChartRenderer
              - ChartFullscreenModal (bar, stacked-bar, horizontal-bar)
              - DualAxisFullscreenModal
              - ProgressBarFullscreenModal
              - Drill-down support
              - Dimension expansion
              - Error boundaries internally
            */}
            <BatchChartRenderer
              chartData={chartData}
              chartDefinition={{
                chart_definition_id: chart.chart_definition_id,
                chart_name: chart.chart_name,
                chart_type: chart.chart_type,
              }}
              position={{ x: 0, y: 0, w: 12, h: 6 }}
              hideHeader={false} // Show header with fullscreen button
            />
          </div>
        )}
      </div>
    </div>
  );
}

