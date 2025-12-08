'use client';

/**
 * Fullscreen Swipe Container Component
 *
 * Main fullscreen container component.
 *
 * Key features:
 * - Renders via portal to document.body (like existing fullscreen modals)
 * - Only mounts when isOpen is true
 * - Uses mounted state for hydration safety (via useChartFullscreen)
 * - Contains both dashboard and overlay layers
 * - Fetches data using existing hooks (not from context)
 * - Keyboard navigation (←→↑↓, H/J/K/L, Space)
 * - Hybrid gesture detection for haptics and direction feedback
 *
 * Pattern from: components/charts/chart-fullscreen-modal.tsx
 *
 * REUSES:
 * - useChartFullscreen from hooks/useChartFullscreen.ts for mounted/scroll/escape
 * - useDashboardData from hooks/use-dashboard-data.ts for chart data fetching
 * - useSwipeDashboards from lib/hooks/use-swipe-dashboards.ts for dashboard list
 * - useSwipeGesture from hooks/useSwipeGesture.ts for haptic/direction feedback
 * - Portal pattern from chart-fullscreen-modal.tsx (createPortal to document.body)
 *
 * NOTE: The simplified context only contains state + setters.
 * Data fetching happens HERE in the container, not in the context.
 * This follows the pattern established by flyout-context.tsx.
 */

import { useMemo, useCallback, useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFullscreenSwipe } from '@/app/fullscreen-swipe-context';
// REUSE existing hooks - DO NOT create new ones
import { useChartFullscreen } from '@/hooks/useChartFullscreen';
import { useDashboardData } from '@/hooks/use-dashboard-data';
import { useSwipeDashboards } from '@/lib/hooks/use-swipe-dashboards';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import type { BatchChartData } from '@/lib/services/dashboard-rendering/mappers';
import DashboardSwipeContainer from './dashboard-swipe-container';
import NavigationOverlay from './navigation-overlay';
import DashboardPeek from './dashboard-peek';
import SwipeLoadingState from './swipe-loading-state';
import SwipeEmptyState from './swipe-empty-state';

/**
 * Trigger haptic feedback if supported
 * Used by hybrid gesture approach for immediate feedback
 */
function triggerHaptic(pattern: number | number[] = 10): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Silently fail - not all devices support vibration
    }
  }
}

export default function FullscreenSwipeContainer() {
  // Get state from simplified context (state + setters only)
  const {
    isOpen,
    setIsOpen,
    currentDashboardId,
    setCurrentDashboardId,
    currentChartIndex,
    setCurrentChartIndex,
    universalFilters,
    showOverlay,
    setShowOverlay,
  } = useFullscreenSwipe();

  // Container ref for focus trap
  const containerRef = useRef<HTMLDivElement>(null);

  // Screen reader announcement state (aria-live)
  const [announcement, setAnnouncement] = useState('');

  // Create close handler for useChartFullscreen
  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, [setIsOpen]);

  // REUSE useChartFullscreen for mounted state, body scroll lock, and escape key
  // This hook handles all the modal lifecycle concerns
  const { mounted } = useChartFullscreen(isOpen, handleClose);

  // REUSE useSwipeDashboards for dashboard list with charts
  // Only fetch when swipe mode is open
  const { data: dashboards = [], isLoading: dashboardsLoading } = useSwipeDashboards({
    enabled: isOpen,
  });

  // Derive dashboard index from ID (context stores ID, not index)
  const currentDashboardIndex = useMemo(() => {
    if (!currentDashboardId) return 0;
    const index = dashboards.findIndex((d) => d.dashboard_id === currentDashboardId);
    return index >= 0 ? index : 0;
  }, [currentDashboardId, dashboards]);

  const currentDashboard = dashboards[currentDashboardIndex];
  const totalCharts = currentDashboard?.charts.length ?? 0;

  // REUSE existing useDashboardData hook for chart data fetching
  // This is the same hook used by dashboard-view.tsx
  const {
    data,
    isLoading: chartsLoading,
    error,
  } = useDashboardData({
    dashboardId: currentDashboard?.dashboard_id ?? '',
    ...(universalFilters && { universalFilters }),
    enabled: isOpen && !!currentDashboard,
  });

  // Prefetch adjacent dashboards for smoother vertical navigation
  const nextDashboard = dashboards[currentDashboardIndex + 1];
  const prevDashboard = dashboards[currentDashboardIndex - 1];

  // Prefetch next dashboard's chart data (React Query caches this)
  useDashboardData({
    dashboardId: nextDashboard?.dashboard_id ?? '',
    ...(universalFilters && { universalFilters }),
    enabled: isOpen && !!nextDashboard,
  });

  // Prefetch previous dashboard's chart data (React Query caches this)
  useDashboardData({
    dashboardId: prevDashboard?.dashboard_id ?? '',
    ...(universalFilters && { universalFilters }),
    enabled: isOpen && !!prevDashboard,
  });

  // Convert data.charts to Map for component consumption
  // data.charts is Record<string, ChartRenderResult>
  const chartDataMap = useMemo(() => {
    if (!data?.charts) return new Map<string, BatchChartData>();
    // Type assertion needed since ChartRenderResult is compatible with BatchChartData
    return new Map(Object.entries(data.charts)) as Map<string, BatchChartData>;
  }, [data?.charts]);

  // Combined loading state
  const isLoading = dashboardsLoading || chartsLoading;

  // Navigation handlers
  const goToNextChart = useCallback(() => {
    if (currentChartIndex < totalCharts - 1) {
      setCurrentChartIndex((prev) => prev + 1);
    }
  }, [currentChartIndex, totalCharts, setCurrentChartIndex]);

  const goToPrevChart = useCallback(() => {
    if (currentChartIndex > 0) {
      setCurrentChartIndex((prev) => prev - 1);
    }
  }, [currentChartIndex, setCurrentChartIndex]);

  const goToNextDashboard = useCallback(() => {
    const nextDashboard = dashboards[currentDashboardIndex + 1];
    if (nextDashboard) {
      setCurrentDashboardId(nextDashboard.dashboard_id);
      setCurrentChartIndex(0);
    }
  }, [currentDashboardIndex, dashboards, setCurrentDashboardId, setCurrentChartIndex]);

  const goToPrevDashboard = useCallback(() => {
    const prevDashboard = dashboards[currentDashboardIndex - 1];
    if (prevDashboard) {
      setCurrentDashboardId(prevDashboard.dashboard_id);
      setCurrentChartIndex(0);
    } else {
      // First dashboard - exit on swipe down
      handleClose();
    }
  }, [currentDashboardIndex, dashboards, setCurrentDashboardId, setCurrentChartIndex, handleClose]);

  // HYBRID APPROACH: useSwipeGesture for haptics and direction detection
  // Scroll-snap CSS handles the actual scrolling, this hook provides feedback
  const { handlers: gestureHandlers } = useSwipeGesture({
    enabled: isOpen,
    threshold: 50,
    velocityThreshold: 0.3,
    onSwipeStart: () => {
      // Direction detected - haptic feedback handled in callbacks below
    },
    onSwipeLeft: () => {
      // Haptic feedback on threshold cross (immediate, before scroll settles)
      triggerHaptic(10); // Light tap
    },
    onSwipeRight: () => {
      triggerHaptic(10); // Light tap
    },
    onSwipeUp: () => {
      triggerHaptic(20); // Medium tap for dashboard change
    },
    onSwipeDown: () => {
      triggerHaptic(20); // Medium tap for dashboard change
    },
    onSwipeEnd: () => {
      // Swipe gesture completed
    },
  });

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      switch (e.key) {
        // Horizontal navigation (charts)
        case 'ArrowRight':
        case 'l':
        case 'L':
          e.preventDefault();
          goToNextChart();
          triggerHaptic(10);
          break;
        case 'ArrowLeft':
        case 'h':
        case 'H':
          e.preventDefault();
          goToPrevChart();
          triggerHaptic(10);
          break;

        // Vertical navigation (dashboards)
        case 'ArrowDown':
        case 'j':
        case 'J':
          e.preventDefault();
          goToNextDashboard();
          triggerHaptic(20);
          break;
        case 'ArrowUp':
        case 'k':
        case 'K':
          e.preventDefault();
          goToPrevDashboard();
          triggerHaptic(20);
          break;

        // Toggle overlay
        case ' ':
          e.preventDefault();
          setShowOverlay((prev) => !prev);
          break;

        // Escape is handled by useChartFullscreen
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, goToNextChart, goToPrevChart, goToNextDashboard, goToPrevDashboard, setShowOverlay]);

  // Handle tap to toggle overlay - only if clicking directly on container background
  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
      // Only toggle if clicking directly on the container (not bubbled from children)
      if (e.target === e.currentTarget) {
        setShowOverlay((prev) => !prev);
      }
    },
    [setShowOverlay]
  );

  // Focus trap - trap focus within fullscreen container when open
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    // Store the element that was focused before opening
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Focus the container
    containerRef.current.focus();

    // Handle Tab key to trap focus
    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !containerRef.current) return;

      const focusableElements = containerRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleTabKey);

    return () => {
      document.removeEventListener('keydown', handleTabKey);
      // Restore focus when closing
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  // Screen reader announcements - announce chart/dashboard changes
  useEffect(() => {
    if (!isOpen || !currentDashboard) return;

    const currentChart = currentDashboard.charts[currentChartIndex];
    const chartName = currentChart?.chart_name ?? 'Chart';

    setAnnouncement(
      `Now viewing ${chartName}, chart ${currentChartIndex + 1} of ${totalCharts}, in ${currentDashboard.dashboard_name}, dashboard ${currentDashboardIndex + 1} of ${dashboards.length}`
    );
  }, [isOpen, currentDashboard, currentChartIndex, totalCharts, currentDashboardIndex, dashboards.length]);

  // Don't render until mounted (hydration safety)
  if (!mounted) return null;

  // Don't render if not open
  if (!isOpen) return null;

  // Loading state - show skeleton while fetching dashboards
  if (dashboardsLoading && dashboards.length === 0) {
    const loadingContent = <SwipeLoadingState onClose={handleClose} />;
    return createPortal(loadingContent, document.body);
  }

  // Empty state - no dashboards available
  if (!dashboardsLoading && dashboards.length === 0) {
    const emptyContent = <SwipeEmptyState onClose={handleClose} />;
    return createPortal(emptyContent, document.body);
  }

  const content = (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-gray-900 dark:bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="Fullscreen chart viewer"
      tabIndex={-1}
      onClick={handleContainerClick}
      {...gestureHandlers}
    >
      {/* Screen reader announcements (aria-live region) */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {announcement}
      </div>

      {/* Main swipe container - pass data and derived state */}
      <DashboardSwipeContainer
        dashboards={dashboards}
        currentDashboardIndex={currentDashboardIndex}
        currentChartIndex={currentChartIndex}
        chartDataMap={chartDataMap}
        isLoading={isLoading}
        error={error}
      />

      {/* Dashboard peek hints (top/bottom edges) */}
      <DashboardPeek dashboards={dashboards} currentDashboardIndex={currentDashboardIndex} />

      {/* Navigation overlay (auto-hides) */}
      <NavigationOverlay
        dashboards={dashboards}
        currentDashboardIndex={currentDashboardIndex}
        currentChartIndex={currentChartIndex}
        showOverlay={showOverlay}
      />
    </div>
  );

  // Render via portal to document.body (same pattern as chart-fullscreen-modal.tsx)
  return createPortal(content, document.body);
}
