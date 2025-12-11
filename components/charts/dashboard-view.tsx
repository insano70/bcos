'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo } from 'react';
import {
  useDashboardData,
  type DashboardUniversalFilters,
} from '@/hooks/useDashboardData';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useAuth } from '@/components/auth/rbac-auth-provider';
import { useChartDefinitions } from '@/hooks/useChartDefinitions';
import { useChartSwapping } from '@/hooks/useChartSwapping';
import { useDashboardConfig } from '@/hooks/useDashboardConfig';
import { useMobileFullscreenNavigation } from '@/hooks/useMobileFullscreenNavigation';
import { useDashboardUniversalFilters } from '@/hooks/useDashboardUniversalFilters';

// Lazy load fullscreen backdrop
const FullscreenBackdrop = dynamic(() => import('./fullscreen-backdrop'), {
  ssr: false,
});
import { DASHBOARD_MESSAGES } from '@/lib/constants/dashboard-messages';
import type { Dashboard, DashboardChart } from '@/lib/types/analytics';
import DashboardChartGrid from './dashboard-chart-grid';
import {
  DashboardEmptyState,
  DashboardErrorState,
  DashboardLoadingState,
} from './dashboard-states';
import DashboardFilterDropdown from './dashboard-filter-dropdown';
import DashboardFilterPills from './dashboard-filter-pills';
import MobileFullscreenModalSwitch from './mobile-fullscreen-modal-switch';

interface DashboardViewProps {
  dashboard: Dashboard;
  dashboardCharts: DashboardChart[];
  /** All published dashboards for cross-dashboard navigation */
  allDashboards?: Array<{ dashboard_id: string; dashboard_name: string }> | undefined;
  /** Current dashboard index in allDashboards array */
  currentDashboardIndex?: number | undefined;
  /** Navigate to a different dashboard (index in allDashboards, optional chartIndex) */
  onNavigateToDashboard?: ((dashboardIndex: number, chartIndex?: number) => void) | undefined;
}

export default function DashboardView({
  dashboard,
  dashboardCharts,
  allDashboards,
  currentDashboardIndex,
  onNavigateToDashboard,
}: DashboardViewProps) {
  const { user, userContext } = useAuth();
  const isMobile = useIsMobile();

  // Get accessible organization IDs for filter validation
  const accessibleOrganizationIds = useMemo(() => {
    return userContext?.accessible_organizations?.map(org => org.organization_id) || [];
  }, [userContext?.accessible_organizations]);

  // Dashboard configuration
  const filterConfig = dashboard.layout_config?.filterConfig;

  // Use extracted hooks for chart definitions, filters, and mobile navigation
  const {
    isLoading: isLoadingCharts,
    error,
    chartsById,
  } = useChartDefinitions();

  const {
    universalFilters,
    handleFilterChange,
    handleRemoveFilter,
    showFilterBar,
    clearInvalidOrgFilter,
  } = useDashboardUniversalFilters({
    userId: user?.id,
    accessibleOrganizationIds,
    filterConfig,
  });

  const {
    mobileFullscreenIndex,
    handleMobileChartTap,
    handleMobileFullscreenClose,
    handleMobileNextChart,
    handleMobilePreviousChart,
    hasCrossDashboardNav,
    canGoNextDashboard,
    canGoPreviousDashboard,
  } = useMobileFullscreenNavigation(dashboardCharts.length, {
    allDashboards,
    currentDashboardIndex,
    onNavigateToDashboard,
  });

  // Track which charts have been swapped via drill-down
  const { swappedCharts, handleChartSwap, handleRevertSwap } = useChartSwapping();

  // Batch rendering data - dashboards always use batch rendering
  const {
    data: batchData,
    isLoading: isBatchLoading,
    error: batchError,
    refetch: refetchBatch,
    metrics: batchMetrics,
  } = useDashboardData({
    dashboardId: dashboard.dashboard_id,
    universalFilters,
    enabled: !isLoadingCharts, // Only fetch after chart definitions loaded
  });

  // Create dashboard configuration from saved dashboard data
  // Memoized to prevent unnecessary re-renders and duplicate chart loads
  const dashboardConfig = useDashboardConfig({
    dashboard,
    dashboardCharts,
    chartsById,
  });

  // Memoized navigation callbacks to prevent object recreation on each render
  const handleNextDashboard = useCallback(() => {
    if (onNavigateToDashboard && currentDashboardIndex !== undefined) {
      onNavigateToDashboard(currentDashboardIndex + 1, 0);
    }
  }, [onNavigateToDashboard, currentDashboardIndex]);

  const handlePreviousDashboard = useCallback(() => {
    if (onNavigateToDashboard && currentDashboardIndex !== undefined) {
      onNavigateToDashboard(currentDashboardIndex - 1, -1);
    }
  }, [onNavigateToDashboard, currentDashboardIndex]);

  // Memoized cross-dashboard navigation props to prevent object recreation
  const crossDashboardNavProps = useMemo(() => ({
    dashboardName: hasCrossDashboardNav ? dashboard.dashboard_name : undefined,
    hasCrossDashboardNav,
    canGoNextDashboard,
    canGoPreviousDashboard,
    onNextDashboard: canGoNextDashboard ? handleNextDashboard : undefined,
    onPreviousDashboard: canGoPreviousDashboard ? handlePreviousDashboard : undefined,
  }), [
    hasCrossDashboardNav,
    dashboard.dashboard_name,
    canGoNextDashboard,
    canGoPreviousDashboard,
    handleNextDashboard,
    handlePreviousDashboard,
  ]);

  // Auto-clear invalid organization filter from sticky filters if access denied
  // This happens when a user switches accounts/organizations but localStorage persists old filters
  useEffect(() => {
    if (batchError?.includes('Access denied') && batchError.includes('organization')) {
      clearInvalidOrgFilter();
    }
  }, [batchError, clearInvalidOrgFilter]);

  // Combined loading state (chart definitions + batch data)
  const isLoading = isLoadingCharts || isBatchLoading;

  // Detect if we're transitioning into fullscreen mode (from cross-dashboard navigation)
  const shouldBeFullscreen = isMobile && mobileFullscreenIndex !== null;

  // Loading state - show fullscreen loading modal if transitioning, otherwise regular loading
  if (isLoading) {
    return (
      <DashboardLoadingState
        dashboardName={dashboard.dashboard_name}
        showFilterBar={showFilterBar}
        universalFilters={universalFilters}
        defaultFilters={filterConfig?.defaultFilters as DashboardUniversalFilters | undefined}
        onFilterChange={handleFilterChange}
        onRemoveFilter={handleRemoveFilter}
        showFullscreenLoading={shouldBeFullscreen}
        onFullscreenClose={handleMobileFullscreenClose}
        crossDashboardNav={crossDashboardNavProps}
      />
    );
  }

  // Handle batch rendering error
  if (batchError) {
    return (
      <DashboardErrorState
        title={DASHBOARD_MESSAGES.ERRORS.BATCH_RENDER_FAILED}
        message={batchError}
        onRetry={() => refetchBatch(true)}
      />
    );
  }

  if (error) {
    return (
      <DashboardErrorState
        title="Dashboard Error"
        message={error}
      />
    );
  }

  if (dashboardConfig.charts.length === 0) {
    return <DashboardEmptyState />;
  }

  return (
    <div className="space-y-4">
      {/* Compact Title Row with Filter Pills and Dropdown */}
      <div className="flex items-center justify-between gap-4 px-4 pt-4">
        {/* Left: Dashboard Title */}
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          {dashboardConfig.dashboardName}
        </h1>

        {/* Right: Filter Pills + Dropdown */}
        {showFilterBar && (
          <div className="flex items-center gap-3">
            {/* Filter Pills (visual indicators) */}
            <DashboardFilterPills
              filters={universalFilters}
              defaultFilters={filterConfig?.defaultFilters as DashboardUniversalFilters | undefined}
              onRemoveFilter={handleRemoveFilter}
              loading={isLoading}
            />

            {/* Filter Dropdown */}
            <DashboardFilterDropdown
              initialFilters={universalFilters}
              onFiltersChange={handleFilterChange}
              loading={isLoading}
              align="right"
            />
          </div>
        )}
      </div>

      {/* Performance Metrics (dev mode only) */}
      {process.env.NODE_ENV === 'development' && batchMetrics && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mx-4">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <span className="font-medium text-blue-900 dark:text-blue-100">⚡ Batch</span>
              <span className="text-blue-700 dark:text-blue-300">{batchMetrics.totalTime}ms</span>
              <span className="text-blue-700 dark:text-blue-300">
                {batchMetrics.cacheHitRate}% cache
              </span>
              <span className="text-blue-700 dark:text-blue-300">
                {batchMetrics.chartsRendered} charts
              </span>
            </div>
            <button
              type="button"
              onClick={() => refetchBatch(true)}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
              aria-label="Refresh batch data"
            >
              🔄
            </button>
          </div>
        </div>
      )}

      {/* Dashboard Grid */}
      <DashboardChartGrid
        charts={dashboardConfig.charts}
        layout={dashboardConfig.layout}
        batchData={batchData}
        chartsById={chartsById}
        swappedCharts={swappedCharts}
        isMobile={isMobile}
        onChartSwap={handleChartSwap}
        onRevertSwap={handleRevertSwap}
        onMobileChartTap={handleMobileChartTap}
      />

      {/* Persistent backdrop for fullscreen modals - animates only on true open/close */}
      <FullscreenBackdrop
        isVisible={isMobile && mobileFullscreenIndex !== null}
        onClose={handleMobileFullscreenClose}
      />

      {/* Mobile fullscreen modal for tap-to-zoom navigation */}
      <MobileFullscreenModalSwitch
        isOpen={isMobile}
        fullscreenIndex={mobileFullscreenIndex}
        charts={dashboardConfig.charts}
        batchData={batchData}
        navigation={{
          onClose: handleMobileFullscreenClose,
          onNextChart: handleMobileNextChart,
          onPreviousChart: handleMobilePreviousChart,
        }}
        crossDashboardNav={crossDashboardNavProps}
        dateRangePreset={universalFilters.dateRangePreset}
      />
    </div>
  );
}
