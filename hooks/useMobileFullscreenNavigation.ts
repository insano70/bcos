/**
 * useMobileFullscreenNavigation Hook
 *
 * Manages mobile fullscreen chart navigation state and handlers.
 * Supports cyclical navigation within dashboard and across dashboards.
 *
 * Extracted from dashboard-view.tsx for better separation of concerns.
 *
 * @module hooks/useMobileFullscreenNavigation
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Configuration for cross-dashboard navigation
 */
export interface CrossDashboardNavConfig {
  /** All published dashboards for navigation */
  allDashboards?: Array<{ dashboard_id: string; dashboard_name: string }> | undefined;
  /** Current dashboard index in allDashboards array */
  currentDashboardIndex?: number | undefined;
  /** Navigate to a different dashboard (index in allDashboards, optional chartIndex) */
  onNavigateToDashboard?: ((dashboardIndex: number, chartIndex?: number) => void) | undefined;
}

/**
 * Return type for useMobileFullscreenNavigation hook
 */
export interface UseMobileFullscreenNavigationResult {
  /** Current fullscreen chart index (null if not in fullscreen) */
  mobileFullscreenIndex: number | null;
  /** Open fullscreen at specific chart index */
  handleMobileChartTap: (chartIndex: number) => void;
  /** Close fullscreen mode */
  handleMobileFullscreenClose: () => void;
  /** Navigate to next chart (with cyclical support) */
  handleMobileNextChart: () => void;
  /** Navigate to previous chart (with cyclical support) */
  handleMobilePreviousChart: () => void;
  /** Whether cross-dashboard navigation is available */
  hasCrossDashboardNav: boolean;
  /** Whether can navigate to next dashboard */
  canGoNextDashboard: boolean;
  /** Whether can navigate to previous dashboard */
  canGoPreviousDashboard: boolean;
}

/**
 * Hook to manage mobile fullscreen chart navigation
 *
 * Features:
 * - Cyclical navigation within dashboard charts
 * - Cross-dashboard navigation (when multiple dashboards available)
 * - URL param initialization (startChart) and cleanup
 * - Supports -1 as "last chart" for navigation from other dashboards
 *
 * @param chartsCount - Number of charts in current dashboard
 * @param crossDashboardNav - Optional cross-dashboard navigation config
 * @returns Navigation state and handlers
 */
export function useMobileFullscreenNavigation(
  chartsCount: number,
  crossDashboardNav?: CrossDashboardNavConfig | undefined
): UseMobileFullscreenNavigationResult {
  const searchParams = useSearchParams();
  const router = useRouter();

  const { allDashboards, currentDashboardIndex, onNavigateToDashboard } = crossDashboardNav ?? {};

  // Initialize fullscreen index from URL param (for cross-dashboard navigation)
  const [mobileFullscreenIndex, setMobileFullscreenIndex] = useState<number | null>(() => {
    const startChart = searchParams.get('startChart');
    if (startChart === null) return null;
    const parsed = parseInt(startChart, 10);
    return Number.isNaN(parsed) ? null : parsed;
  });

  // Handle startChart URL param for cross-dashboard navigation
  // -1 means "last chart", so resolve it once charts are loaded
  // Also clean up the URL param after reading to keep URLs clean
  useEffect(() => {
    const startChart = searchParams.get('startChart');
    if (startChart === null) return;

    if (chartsCount === 0) return; // Charts not loaded yet

    const parsed = parseInt(startChart, 10);
    if (Number.isNaN(parsed)) return;

    // Handle -1 as "last chart"
    if (parsed === -1) {
      setMobileFullscreenIndex(chartsCount - 1);
    } else if (parsed >= 0 && parsed < chartsCount) {
      // Ensure index is valid (it was already set in initial state, but validate)
      setMobileFullscreenIndex(parsed);
    }

    // Clean up URL param after reading (keep other params)
    const currentParams = new URLSearchParams(searchParams.toString());
    currentParams.delete('startChart');
    const queryString = currentParams.toString();
    const newUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ''}`;
    router.replace(newUrl, { scroll: false });
  }, [searchParams, chartsCount, router]);

  // Navigation handlers
  const handleMobileChartTap = useCallback((chartIndex: number) => {
    setMobileFullscreenIndex(chartIndex);
  }, []);

  const handleMobileFullscreenClose = useCallback(() => {
    setMobileFullscreenIndex(null);
  }, []);

  const handleMobileNextChart = useCallback(() => {
    setMobileFullscreenIndex((prev) => {
      if (prev === null) return null;
      const maxIndex = chartsCount - 1;
      if (prev < maxIndex) {
        return prev + 1;
      }
      // At last chart - handle cyclical navigation
      if (onNavigateToDashboard && allDashboards && currentDashboardIndex !== undefined) {
        if (currentDashboardIndex < allDashboards.length - 1) {
          // Go to next dashboard
          onNavigateToDashboard(currentDashboardIndex + 1, 0);
        } else {
          // At last dashboard - wrap to first chart of first dashboard
          onNavigateToDashboard(0, 0);
        }
        return prev;
      }
      // Single dashboard - wrap to first chart
      return 0;
    });
  }, [chartsCount, onNavigateToDashboard, allDashboards, currentDashboardIndex]);

  const handleMobilePreviousChart = useCallback(() => {
    setMobileFullscreenIndex((prev) => {
      if (prev === null) return null;
      if (prev > 0) {
        return prev - 1;
      }
      // At first chart - handle cyclical navigation
      if (onNavigateToDashboard && allDashboards && currentDashboardIndex !== undefined) {
        if (currentDashboardIndex > 0) {
          // Go to previous dashboard (last chart)
          onNavigateToDashboard(currentDashboardIndex - 1, -1);
        } else {
          // At first dashboard - wrap to last chart of last dashboard
          onNavigateToDashboard(allDashboards.length - 1, -1);
        }
        return prev;
      }
      // Single dashboard - wrap to last chart
      return chartsCount - 1;
    });
  }, [chartsCount, onNavigateToDashboard, allDashboards, currentDashboardIndex]);

  // Cross-dashboard navigation state
  // With cyclical navigation, dashboard buttons are always enabled when cross-dashboard nav is available
  const hasCrossDashboardNav = Boolean(
    allDashboards && allDashboards.length > 1 && currentDashboardIndex !== undefined
  );
  const canGoNextDashboard = hasCrossDashboardNav;
  const canGoPreviousDashboard = hasCrossDashboardNav;

  return {
    mobileFullscreenIndex,
    handleMobileChartTap,
    handleMobileFullscreenClose,
    handleMobileNextChart,
    handleMobilePreviousChart,
    hasCrossDashboardNav,
    canGoNextDashboard,
    canGoPreviousDashboard,
  };
}

export default useMobileFullscreenNavigation;
