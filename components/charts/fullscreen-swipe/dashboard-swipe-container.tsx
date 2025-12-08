'use client';

/**
 * Dashboard Swipe Container Component
 *
 * Vertical scroll-snap container for dashboard navigation.
 *
 * NOTE: Receives data via props from FullscreenSwipeContainer.
 * Does NOT use context for data - only for setters.
 * This follows the pattern where data flows down via props.
 *
 * Unlike ChartSwipeContainer, this component needs custom scroll handling
 * because it must:
 * 1. Update dashboard ID (not just index)
 * 2. Reset chart index when switching dashboards
 * 3. Handle over-scroll exit gesture
 */

import { useCallback } from 'react';
import { useFullscreenSwipe } from '@/app/fullscreen-swipe-context';
import { useSyncedScrollSnap } from '@/hooks/useSyncedScrollSnap';
import type { DashboardWithCharts } from '@/lib/types/dashboards';
import type { BatchChartData } from '@/lib/services/dashboard-rendering/mappers';
import ChartSwipeContainer from './chart-swipe-container';

interface DashboardSwipeContainerProps {
  /** Array of dashboards with charts */
  dashboards: DashboardWithCharts[];
  /** Current dashboard index */
  currentDashboardIndex: number;
  /** Current chart index within dashboard */
  currentChartIndex: number;
  /** Map of chart ID to chart data */
  chartDataMap: Map<string, BatchChartData>;
  /** Whether chart data is loading */
  isLoading: boolean;
  /** Error message if data fetch failed */
  error: string | null;
}

export default function DashboardSwipeContainer({
  dashboards,
  currentDashboardIndex,
  currentChartIndex,
  chartDataMap,
  isLoading,
  error,
}: DashboardSwipeContainerProps) {
  // Get setters from context (state flows down via props, setters from context)
  const { setCurrentDashboardId, setIsOpen, setCurrentChartIndex } = useFullscreenSwipe();

  // Handle index change - update dashboard ID and reset chart index
  const handleDashboardChange = useCallback(
    (newIndex: number) => {
      const targetDashboard = dashboards[newIndex];
      if (targetDashboard) {
        setCurrentDashboardId(targetDashboard.dashboard_id);
        setCurrentChartIndex(0);
      }
    },
    [dashboards, setCurrentDashboardId, setCurrentChartIndex]
  );

  // Use shared scroll-snap sync hook (DRY pattern)
  const { containerRef, handleScroll: baseHandleScroll } = useSyncedScrollSnap({
    currentIndex: currentDashboardIndex,
    itemCount: dashboards.length,
    onIndexChange: handleDashboardChange,
    axis: 'vertical',
  });

  // Extended scroll handler with over-scroll exit gesture
  const handleScroll = useCallback(() => {
    baseHandleScroll();

    // Exit if scrolled above first dashboard (over-scroll to dismiss)
    if (containerRef.current) {
      const scrollTop = containerRef.current.scrollTop;
      if (scrollTop < -100 && currentDashboardIndex === 0) {
        setIsOpen(false);
      }
    }
  }, [baseHandleScroll, containerRef, currentDashboardIndex, setIsOpen]);

  const currentDashboard = dashboards[currentDashboardIndex];

  return (
    <div
      ref={containerRef}
      className="dashboard-swipe-container"
      onScroll={handleScroll}
    >
      {dashboards.map((dashboard, index) => (
        <div key={dashboard.dashboard_id} className="dashboard-slide">
          {/* Only render chart container for current dashboard to save resources */}
          {index === currentDashboardIndex && currentDashboard && (
            <ChartSwipeContainer
              dashboard={currentDashboard}
              currentChartIndex={currentChartIndex}
              chartDataMap={chartDataMap}
              isLoading={isLoading}
              error={error}
            />
          )}
        </div>
      ))}
    </div>
  );
}
