'use client';

/**
 * Chart Swipe Container Component
 *
 * Horizontal scroll-snap container for chart navigation within a dashboard.
 *
 * NOTE: Receives data via props from DashboardSwipeContainer.
 * Uses context ONLY for setters (setCurrentChartIndex).
 */

import { useFullscreenSwipe } from '@/app/fullscreen-swipe-context';
import { useSyncedScrollSnap } from '@/hooks/useSyncedScrollSnap';
import type { DashboardWithCharts } from '@/lib/types/dashboards';
import type { BatchChartData } from '@/lib/services/dashboard-rendering/mappers';
import ChartSlide from './chart-slide';

interface ChartSwipeContainerProps {
  /** Current dashboard with charts */
  dashboard: DashboardWithCharts;
  /** Current chart index */
  currentChartIndex: number;
  /** Map of chart ID to chart data */
  chartDataMap: Map<string, BatchChartData>;
  /** Whether chart data is loading */
  isLoading: boolean;
  /** Error message if data fetch failed */
  error: string | null;
}

export default function ChartSwipeContainer({
  dashboard,
  currentChartIndex,
  chartDataMap,
  isLoading,
  error,
}: ChartSwipeContainerProps) {
  // Get setter from context
  const { setCurrentChartIndex } = useFullscreenSwipe();

  // Use shared scroll-snap sync hook (DRY pattern extracted from duplicate logic)
  const { containerRef, handleScroll } = useSyncedScrollSnap({
    currentIndex: currentChartIndex,
    itemCount: dashboard.charts.length,
    onIndexChange: setCurrentChartIndex,
    axis: 'horizontal',
  });

  return (
    <div
      ref={containerRef}
      className="chart-swipe-container"
      onScroll={handleScroll}
    >
      {dashboard.charts.map((chart, index) => {
        // Get chart data from the map
        const chartData = chartDataMap.get(chart.chart_definition_id) ?? null;

        // Transform chart to DashboardChartEntry format (handle undefined -> null for description)
        const chartEntry = {
          chart_definition_id: chart.chart_definition_id,
          chart_name: chart.chart_name,
          chart_description: chart.chart_description ?? null,
          chart_type: chart.chart_type,
          position_config: chart.position_config ?? { x: 0, y: 0, w: 12, h: 6 },
        };

        return (
          <ChartSlide
            key={chart.chart_definition_id}
            chart={chartEntry}
            chartData={chartData}
            isActive={index === currentChartIndex}
            isAdjacent={Math.abs(index - currentChartIndex) <= 1}
            isLoading={isLoading}
            error={error}
          />
        );
      })}
    </div>
  );
}
