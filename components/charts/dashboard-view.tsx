'use client';

import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import {
  useDashboardData,
  type DashboardUniversalFilters,
} from '@/hooks/useDashboardData';
import { useStickyFilters } from '@/hooks/useStickyFilters';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useAuth } from '@/components/auth/rbac-auth-provider';
import { apiClient } from '@/lib/api/client';

// Lazy load fullscreen modals for mobile tap-to-zoom
const ChartFullscreenModal = dynamic(() => import('./chart-fullscreen-modal'), {
  ssr: false,
});
const DualAxisFullscreenModal = dynamic(() => import('./dual-axis-fullscreen-modal'), {
  ssr: false,
});
const ProgressBarFullscreenModal = dynamic(() => import('./progress-bar-fullscreen-modal'), {
  ssr: false,
});
const NumberFullscreenModal = dynamic(() => import('./number-fullscreen-modal'), {
  ssr: false,
});
const PieFullscreenModal = dynamic(() => import('./pie-fullscreen-modal'), {
  ssr: false,
});
const TableFullscreenModal = dynamic(() => import('./table-fullscreen-modal'), {
  ssr: false,
});
import {
  DASHBOARD_LAYOUT,
  getResponsiveColSpan,
} from '@/lib/constants/dashboard-layout';
import { DASHBOARD_MESSAGES } from '@/lib/constants/dashboard-messages';
import type {
  ChartConfig,
  ChartDataSourceConfig,
  ChartDefinition,
  Dashboard,
  DashboardChart,
} from '@/lib/types/analytics';
import type { BatchChartData } from './batch-chart-renderer';
import BatchChartRenderer from './batch-chart-renderer';
import ChartErrorBoundary from './chart-error-boundary';
import DashboardFilterDropdown from './dashboard-filter-dropdown';
import DashboardFilterPills from './dashboard-filter-pills';
import { clearDimensionCaches } from '@/hooks/useDimensionExpansion';
import { clientDebugLog, clientErrorLog } from '@/lib/utils/debug-client';

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

/**
 * Track swapped charts: originalChartId -> targetChartId
 */
type SwappedChartsMap = Map<string, string>;

export default function DashboardView({
  dashboard,
  dashboardCharts,
  allDashboards,
  currentDashboardIndex,
  onNavigateToDashboard,
}: DashboardViewProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, userContext } = useAuth();
  
  // Get accessible organization IDs for filter validation
  const accessibleOrganizationIds = useMemo(() => {
    return userContext?.accessible_organizations?.map(org => org.organization_id) || [];
  }, [userContext?.accessible_organizations]);
  
  // Use user-scoped sticky filters with organization validation
  const { loadPreferences, savePreferences, removeFilter } = useStickyFilters({
    userId: user?.id,
    accessibleOrganizationIds,
  });
  
  const [availableCharts, setAvailableCharts] = useState<ChartDefinition[]>([]);
  const [isLoadingCharts, setIsLoadingCharts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Track which charts have been swapped via drill-down
  const [swappedCharts, setSwappedCharts] = useState<SwappedChartsMap>(new Map());

  // Mobile fullscreen navigation state
  const isMobile = useIsMobile();

  // Initialize fullscreen index from URL param (for cross-dashboard navigation)
  const [mobileFullscreenIndex, setMobileFullscreenIndex] = useState<number | null>(() => {
    const startChart = searchParams.get('startChart');
    if (startChart === null) return null;
    const parsed = parseInt(startChart, 10);
    return Number.isNaN(parsed) ? null : parsed;
  });

  // Dashboard configuration
  const filterConfig = dashboard.layout_config?.filterConfig;
  const showFilterBar = filterConfig?.enabled !== false; // Default to true if not specified

  // Dashboard-level universal filters with default values
  // Priority: URL params > localStorage > default filters from config > system defaults
  const [universalFilters, setUniversalFilters] = useState<DashboardUniversalFilters>(() => {
    const practice = searchParams.get('practice');
    const defaultFilters = filterConfig?.defaultFilters || {};
    const savedPreferences = loadPreferences();

    // Parse practice UID safely with NaN validation
    let practiceUids: number[] | undefined;
    if (practice) {
      const parsed = parseInt(practice, 10);
      if (!Number.isNaN(parsed)) {
        practiceUids = [parsed];
      }
    } else if (savedPreferences.practiceUids && savedPreferences.practiceUids.length > 0) {
      // Use saved practice UIDs if no URL param
      practiceUids = savedPreferences.practiceUids;
    }

    return {
      // NEW PRIORITY CHAIN: URL params > localStorage > Dashboard defaults > undefined
      dateRangePreset:
        searchParams.get('datePreset') ||
        savedPreferences.dateRangePreset ||
        defaultFilters.dateRangePreset ||
        undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      organizationId:
        searchParams.get('org') ||
        savedPreferences.organizationId ||
        defaultFilters.organizationId ||
        undefined,
      practiceUids,
      providerName:
        searchParams.get('provider') || savedPreferences.providerName || undefined,
    } as DashboardUniversalFilters;
  });

  // URL param management
  const updateUrlParams = useCallback(
    (filters: DashboardUniversalFilters) => {
      const params = new URLSearchParams();

      if (filters.dateRangePreset) params.set('datePreset', filters.dateRangePreset);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.organizationId) params.set('org', filters.organizationId);
      if (
        filters.practiceUids &&
        filters.practiceUids.length > 0 &&
        filters.practiceUids[0] !== undefined
      ) {
        params.set('practice', filters.practiceUids[0].toString());
      }
      if (filters.providerName) params.set('provider', filters.providerName);

      // Update URL without scroll, preserving history
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router]
  );

  // Handle filter changes
  const handleFilterChange = useCallback(
    (newFilters: DashboardUniversalFilters) => {
      // Clear dimension expansion caches when filters change
      // This ensures fresh dimension value counts are fetched
      clearDimensionCaches();
      
      setUniversalFilters(newFilters);
      updateUrlParams(newFilters);
      savePreferences(newFilters); // Save to localStorage
    },
    [updateUrlParams, savePreferences]
  );

  // Handle chart swap drill-down
  const handleChartSwap = useCallback(
    (sourceChartId: string, targetChartId: string) => {
      clientDebugLog.component('Dashboard chart swap', { sourceChartId, targetChartId });
      setSwappedCharts((prev) => {
        const next = new Map(prev);
        next.set(sourceChartId, targetChartId);
        return next;
      });
    },
    []
  );

  // Handle reverting a swapped chart back to original
  const handleRevertSwap = useCallback(
    (sourceChartId: string) => {
      setSwappedCharts((prev) => {
        const next = new Map(prev);
        next.delete(sourceChartId);
        return next;
      });
    },
    []
  );

  // Mobile fullscreen navigation handlers
  const handleMobileChartTap = useCallback((chartIndex: number) => {
    setMobileFullscreenIndex(chartIndex);
  }, []);

  const handleMobileFullscreenClose = useCallback(() => {
    setMobileFullscreenIndex(null);
  }, []);

  const handleMobileNextChart = useCallback(() => {
    setMobileFullscreenIndex((prev) => {
      if (prev === null) return null;
      const maxIndex = dashboardCharts.length - 1;
      if (prev < maxIndex) {
        return prev + 1;
      }
      // At last chart - check if we can go to next dashboard
      if (onNavigateToDashboard && allDashboards && currentDashboardIndex !== undefined) {
        if (currentDashboardIndex < allDashboards.length - 1) {
          onNavigateToDashboard(currentDashboardIndex + 1, 0); // First chart of next dashboard
        }
      }
      return prev;
    });
  }, [dashboardCharts.length, onNavigateToDashboard, allDashboards, currentDashboardIndex]);

  const handleMobilePreviousChart = useCallback(() => {
    setMobileFullscreenIndex((prev) => {
      if (prev === null) return null;
      if (prev > 0) {
        return prev - 1;
      }
      // At first chart - check if we can go to previous dashboard
      if (onNavigateToDashboard && allDashboards && currentDashboardIndex !== undefined) {
        if (currentDashboardIndex > 0) {
          onNavigateToDashboard(currentDashboardIndex - 1, -1); // Last chart of previous dashboard (-1 signals "last")
        }
      }
      return prev;
    });
  }, [onNavigateToDashboard, allDashboards, currentDashboardIndex]);

  // Handle removing individual filter pill
  const handleRemoveFilter = useCallback(
    (filterKey: keyof DashboardUniversalFilters) => {
      // Clear dimension expansion caches when filters change
      clearDimensionCaches();
      
      const newFilters = { ...universalFilters };

      // Remove the specific filter
      if (filterKey === 'dateRangePreset') {
        delete newFilters.dateRangePreset;
        delete newFilters.startDate;
        delete newFilters.endDate;
        removeFilter('dateRangePreset');
      } else if (filterKey === 'organizationId') {
        delete newFilters.organizationId;
        removeFilter('organizationId');
      } else if (filterKey === 'practiceUids') {
        delete newFilters.practiceUids;
        removeFilter('practiceUids');
      } else if (filterKey === 'providerName') {
        delete newFilters.providerName;
        removeFilter('providerName');
      } else {
        // For startDate, endDate (not stored in sticky filters)
        delete newFilters[filterKey];
      }

      setUniversalFilters(newFilters);
      updateUrlParams(newFilters);
    },
    [universalFilters, updateUrlParams, removeFilter]
  );

  const loadChartDefinitions = async () => {
    try {
      const result = await apiClient.get<{
        charts: ChartDefinition[] | Array<{ chart_definitions: ChartDefinition }>;
      }>('/api/admin/analytics/charts?is_active=true');
      const charts = (result.charts || [])
        .map((item: ChartDefinition | { chart_definitions: ChartDefinition }) => {
          return 'chart_definitions' in item ? item.chart_definitions : item;
        })
        .filter((chart: ChartDefinition) => chart.is_active !== false);

      setAvailableCharts(charts);
    } catch (error) {
      clientErrorLog('Failed to load chart definitions:', error);
      setError(DASHBOARD_MESSAGES.ERRORS.CHART_DEFINITIONS_LOAD_FAILED);
    } finally {
      setIsLoadingCharts(false);
    }
  };

  // Load available chart definitions for rendering - use ref to prevent double execution
  const hasLoadedRef = React.useRef(false);

  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadChartDefinitions();
    }
  }, []);

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
  const dashboardConfig = useMemo(
    () => ({
      dashboardName: dashboard.dashboard_name || 'Unnamed Dashboard',
      dashboardDescription: dashboard.dashboard_description || '',
      charts:
        dashboardCharts
          ?.map((chartAssoc, index) => {
            const chartDefinition = availableCharts.find(
              (chart) => chart.chart_definition_id === chartAssoc.chart_definition_id
            );

            // Extract and stabilize config objects to prevent duplicate renders
            const dataSource: ChartDataSourceConfig = chartDefinition?.data_source || {
              table: '',
              filters: [],
              orderBy: [],
            };
            const chartConfig: ChartConfig = chartDefinition?.chart_config || {
              x_axis: { field: '', label: '', format: 'string' },
              y_axis: { field: '', label: '', format: 'number' },
              options: { responsive: true, showLegend: true, showTooltips: true, animation: true },
            };

            return {
              id: `dashboard-chart-${index}`,
              chartDefinitionId: chartAssoc.chart_definition_id,
              position: chartAssoc.position_config,
              chartDefinition,
              // Pre-extract configs to stabilize object references
              dataSource,
              chartConfig,
            };
          })
          .filter((chart) => chart.chartDefinition) || [],
      layout: {
        columns: dashboard.layout_config?.columns || DASHBOARD_LAYOUT.GRID_COLUMNS,
        rowHeight: dashboard.layout_config?.rowHeight || DASHBOARD_LAYOUT.ROW_HEIGHT,
        margin: dashboard.layout_config?.margin || DASHBOARD_LAYOUT.MARGIN,
      },
    }),
    [dashboard, dashboardCharts, availableCharts]
  );

  // Handle startChart URL param for cross-dashboard navigation
  // -1 means "last chart", so resolve it once charts are loaded
  // Also clean up the URL param after reading to keep URLs clean
  useEffect(() => {
    const startChart = searchParams.get('startChart');
    if (startChart === null) return;

    const chartsLength = dashboardConfig.charts.length;
    if (chartsLength === 0) return; // Charts not loaded yet

    const parsed = parseInt(startChart, 10);
    if (Number.isNaN(parsed)) return;

    // Handle -1 as "last chart"
    if (parsed === -1) {
      setMobileFullscreenIndex(chartsLength - 1);
    } else if (parsed >= 0 && parsed < chartsLength) {
      // Ensure index is valid (it was already set in initial state, but validate)
      setMobileFullscreenIndex(parsed);
    }

    // Clean up URL param after reading (keep other params)
    const currentParams = new URLSearchParams(searchParams.toString());
    currentParams.delete('startChart');
    const queryString = currentParams.toString();
    const newUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ''}`;
    router.replace(newUrl, { scroll: false });
  }, [searchParams, dashboardConfig.charts.length, router]);

  // Auto-clear invalid organization filter from sticky filters if access denied
  // This happens when a user switches accounts/organizations but localStorage persists old filters
  useEffect(() => {
    if (batchError?.includes('Access denied') && batchError.includes('organization')) {
      // Organization access error - clear invalid org filter from sticky filters
      if (universalFilters.organizationId) {
        console.warn('[DashboardView] Clearing invalid organization filter from sticky filters', {
          invalidOrgId: universalFilters.organizationId,
          error: batchError,
        });

        // Clear the invalid organization from sticky filters
        removeFilter('organizationId');

        // Update state to remove org filter and trigger refetch
        const cleanedFilters = { ...universalFilters };
        delete cleanedFilters.organizationId;
        setUniversalFilters(cleanedFilters);
        updateUrlParams(cleanedFilters);
      }
    }
  }, [batchError, universalFilters, removeFilter, updateUrlParams]);

  // Combined loading state (chart definitions + batch data)
  const isLoading = isLoadingCharts || isBatchLoading;

  // Loading state - show title and filters with spinner
  if (isLoading) {
    return (
      <div className="space-y-4">
        {/* Title Row - visible during loading */}
        <div className="flex items-center justify-between gap-4 px-4 pt-4">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {dashboard.dashboard_name || 'Loading Dashboard...'}
          </h1>

          {/* Filter controls visible but disabled during loading */}
          {showFilterBar && (
            <div className="flex items-center gap-3 opacity-50 pointer-events-none">
              <DashboardFilterPills
                filters={universalFilters}
                defaultFilters={filterConfig?.defaultFilters as DashboardUniversalFilters | undefined}
                onRemoveFilter={handleRemoveFilter}
                loading={true}
              />
              <DashboardFilterDropdown
                initialFilters={universalFilters}
                onFiltersChange={handleFilterChange}
                loading={true}
                align="right"
              />
            </div>
          )}
        </div>

        {/* Simple centered spinner */}
        <div className="flex items-center justify-center min-h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600" />
          <span className="ml-3 text-gray-600 dark:text-gray-400">Loading...</span>
        </div>
      </div>
    );
  }

  // Handle batch rendering error
  if (batchError) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
        <div className="flex items-center">
          <svg
            className="w-6 h-6 text-red-600 dark:text-red-400 mr-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <div>
            <h3 className="text-red-800 dark:text-red-200 font-medium">{DASHBOARD_MESSAGES.ERRORS.BATCH_RENDER_FAILED}</h3>
            <p className="text-red-600 dark:text-red-400 text-sm mt-1">{batchError}</p>
            <button
              type="button"
              onClick={() => refetchBatch(true)}
              className="mt-3 btn-sm bg-red-600 hover:bg-red-700 text-white"
            >
              {DASHBOARD_MESSAGES.ACTIONS.RETRY}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
        <div className="flex items-center">
          <svg
            className="w-6 h-6 text-red-600 dark:text-red-400 mr-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <div>
            <h3 className="text-red-800 dark:text-red-200 font-medium">Dashboard Error</h3>
            <p className="text-red-600 dark:text-red-400 text-sm mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (dashboardConfig.charts.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">📊</div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">{DASHBOARD_MESSAGES.EMPTY.TITLE}</h3>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          {DASHBOARD_MESSAGES.EMPTY.DESCRIPTION}
        </p>
      </div>
    );
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
            <button type="button" onClick={() => refetchBatch(true)}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
            >
              🔄
            </button>
          </div>
        </div>
      )}

      {/* Dashboard Grid - Following /dashboard pattern */}
      <div className="grid grid-cols-12 gap-6 w-full px-4 pb-4">
        {dashboardConfig.charts.map((dashboardChart, chartIndex) => {
          if (!dashboardChart.chartDefinition) {
            const colSpanClass = getResponsiveColSpan(dashboardChart.position.w);

            return (
              <motion.div
                key={dashboardChart.id}
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ 
                  duration: 0.4, 
                  delay: chartIndex * 0.06,
                  ease: [0.25, 0.46, 0.45, 0.94]
                }}
                className={`${colSpanClass} flex flex-col bg-white dark:bg-gray-800 shadow-sm rounded-xl border border-dashed border-gray-300 dark:border-gray-600`}
              >
                <div className="flex items-center justify-center h-48 text-center text-gray-500 dark:text-gray-400">
                  <div>
                    <div className="text-2xl mb-2">⚠️</div>
                    <p className="text-sm">{DASHBOARD_MESSAGES.ERRORS.CHART_NOT_FOUND}</p>
                    <p className="text-xs">ID: {dashboardChart.chartDefinitionId.slice(0, 8)}...</p>
                  </div>
                </div>
              </motion.div>
            );
          }

          // Use pre-extracted configs from memoized dashboardConfig
          const originalChartDef = dashboardChart.chartDefinition;
          const originalChartConfig = dashboardChart.chartConfig;

          // Check if this chart has been swapped via drill-down
          const swappedToChartId = swappedCharts.get(dashboardChart.chartDefinitionId);
          const isSwapped = !!swappedToChartId;

          // Determine which chart to render (original or swapped)
          const swappedChartDef = isSwapped 
            ? availableCharts.find((c) => c.chart_definition_id === swappedToChartId)
            : null;
          
          const chartDef = swappedChartDef ?? originalChartDef;
          const chartConfig = swappedChartDef?.chart_config ?? originalChartConfig;

          // Use responsive sizing that respects dashboard configuration
          const baseHeight = dashboardChart.position.h * DASHBOARD_LAYOUT.CHART.HEIGHT_MULTIPLIER;
          const containerHeight = Math.max(baseHeight, DASHBOARD_LAYOUT.CHART.MIN_HEIGHT);

          // Determine responsive column span classes
          const colSpanClass = getResponsiveColSpan(dashboardChart.position.w);

          // Get batch data for the chart being rendered
          // For swapped charts, we need to fetch data from a different source
          const chartIdForData = isSwapped && swappedToChartId ? swappedToChartId : dashboardChart.chartDefinitionId;
          const batchChartData = batchData?.charts[chartIdForData];

          // Skip chart if no data returned from batch API
          if (!batchChartData) {
            return (
              <motion.div
                key={dashboardChart.id}
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ 
                  duration: 0.4, 
                  delay: chartIndex * 0.06,
                  ease: [0.25, 0.46, 0.45, 0.94]
                }}
                className={`${colSpanClass} flex flex-col bg-white dark:bg-gray-800 shadow-sm rounded-xl border border-dashed border-gray-300 dark:border-gray-600`}
              >
                <div className="flex items-center justify-center h-48 text-center text-gray-500 dark:text-gray-400">
                  <div>
                    <div className="text-2xl mb-2">⚠️</div>
                    <p className="text-sm">{DASHBOARD_MESSAGES.ERRORS.CHART_DATA_UNAVAILABLE}</p>
                    <p className="text-xs">ID: {chartIdForData.slice(0, 8)}...</p>
                    {isSwapped && (
                      <button
                        type="button"
                        onClick={() => handleRevertSwap(dashboardChart.chartDefinitionId)}
                        className="mt-2 text-xs text-violet-600 hover:text-violet-800 dark:text-violet-400"
                      >
                        Revert to original chart
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          }

          return (
            <motion.div
              key={dashboardChart.id}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                duration: 0.4,
                delay: chartIndex * 0.06,
                ease: [0.25, 0.46, 0.45, 0.94]
              }}
              className={`${colSpanClass} flex flex-col relative ${isMobile ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''}`}
              style={{
                marginBottom: `${dashboardConfig.layout.margin}px`,
                height: `${containerHeight}px`,
                maxHeight: `${containerHeight}px`,
                overflow: 'hidden',
              }}
              onClick={isMobile ? () => handleMobileChartTap(chartIndex) : undefined}
            >
              {/* Swap indicator with revert button */}
              {isSwapped && (
                <div className="absolute top-0 right-0 z-10 flex items-center gap-1 px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 text-xs rounded-bl-lg rounded-tr-xl">
                  <span className="hidden sm:inline">Swapped from: {originalChartDef.chart_name.slice(0, 15)}...</span>
                  <button
                    type="button"
                    onClick={() => handleRevertSwap(dashboardChart.chartDefinitionId)}
                    className="p-0.5 hover:bg-amber-200 dark:hover:bg-amber-800 rounded transition-colors"
                    title="Revert to original chart"
                    aria-label="Revert to original chart"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Chart with dimension expansion support (via fullscreen modals) - wrap with error boundary */}
              <ChartErrorBoundary chartName={chartDef.chart_name}>
                <BatchChartRenderer
                  chartDefinitionId={chartDef.chart_definition_id}
                  chartData={batchChartData as BatchChartData}
                  chartDefinition={{
                    chart_definition_id: chartDef.chart_definition_id,
                    chart_name: chartDef.chart_name,
                    chart_type: chartDef.chart_type,
                    chart_config: chartConfig,
                    // Pass drill-down config from chart definition (only if defined)
                    ...(chartDef.drill_down_enabled !== undefined && { drill_down_enabled: chartDef.drill_down_enabled }),
                    ...(chartDef.drill_down_type !== undefined && { drill_down_type: chartDef.drill_down_type }),
                    ...(chartDef.drill_down_target_chart_id !== undefined && { drill_down_target_chart_id: chartDef.drill_down_target_chart_id }),
                    ...(chartDef.drill_down_button_label !== undefined && { drill_down_button_label: chartDef.drill_down_button_label }),
                  }}
                  position={dashboardChart.position}
                  className="w-full h-full flex-1"
                  responsive={true}
                  minHeight={DASHBOARD_LAYOUT.CHART.MIN_HEIGHT_WITH_PADDING}
                  maxHeight={containerHeight - DASHBOARD_LAYOUT.CHART.HEIGHT_PADDING}
                  onChartSwap={handleChartSwap}
                  {...((chartDef.chart_type === 'bar' ||
                    chartDef.chart_type === 'stacked-bar' ||
                    chartDef.chart_type === 'horizontal-bar' ||
                    chartDef.chart_type === 'dual-axis') && {
                    onFullscreen: () => {}, // Will be handled by BatchChartRenderer internally
                  })}
                />
              </ChartErrorBoundary>
            </motion.div>
          );
        })}
      </div>

      {/* Mobile fullscreen modal for tap-to-zoom navigation */}
      {isMobile && mobileFullscreenIndex !== null && (() => {
        const currentChart = dashboardConfig.charts[mobileFullscreenIndex];
        if (!currentChart?.chartDefinition) return null;

        const chartDef = currentChart.chartDefinition;
        const chartIdForData = currentChart.chartDefinitionId;
        const batchChartData = batchData?.charts[chartIdForData] as BatchChartData | undefined;

        if (!batchChartData) return null;

        // Cross-dashboard navigation state
        const hasCrossDashboardNav = Boolean(allDashboards && allDashboards.length > 1 && currentDashboardIndex !== undefined);
        const canGoNextDashboard = hasCrossDashboardNav && currentDashboardIndex !== undefined && allDashboards !== undefined && currentDashboardIndex < allDashboards.length - 1;
        const canGoPrevDashboard = hasCrossDashboardNav && currentDashboardIndex !== undefined && currentDashboardIndex > 0;

        // Chart navigation considers cross-dashboard boundaries
        const isLastChart = mobileFullscreenIndex >= dashboardConfig.charts.length - 1;
        const isFirstChart = mobileFullscreenIndex <= 0;
        const canGoNextChart = !isLastChart || canGoNextDashboard;
        const canGoPrevChart = !isFirstChart || canGoPrevDashboard;

        // Common navigation props for all fullscreen modals
        const navigationProps = {
          onNextChart: handleMobileNextChart,
          onPreviousChart: handleMobilePreviousChart,
          canGoNext: canGoNextChart,
          canGoPrevious: canGoPrevChart,
          chartPosition: `${mobileFullscreenIndex + 1} of ${dashboardConfig.charts.length}`,
          // Dashboard navigation props
          dashboardName: hasCrossDashboardNav ? dashboard.dashboard_name : undefined,
          onNextDashboard: canGoNextDashboard && onNavigateToDashboard && currentDashboardIndex !== undefined
            ? () => onNavigateToDashboard(currentDashboardIndex + 1, 0)
            : undefined,
          onPreviousDashboard: canGoPrevDashboard && onNavigateToDashboard && currentDashboardIndex !== undefined
            ? () => onNavigateToDashboard(currentDashboardIndex - 1, -1)
            : undefined,
          canGoNextDashboard,
          canGoPreviousDashboard: canGoPrevDashboard,
        };

        // Render appropriate fullscreen modal based on chart type
        switch (chartDef.chart_type) {
          case 'bar':
          case 'stacked-bar':
          case 'horizontal-bar':
          case 'line':
          case 'area':
            return (
              <ChartFullscreenModal
                isOpen={true}
                onClose={handleMobileFullscreenClose}
                chartTitle={chartDef.chart_name}
                chartData={batchChartData.chartData}
                chartType={chartDef.chart_type as 'bar' | 'stacked-bar' | 'horizontal-bar' | 'line' | 'area'}
                frequency={batchChartData.metadata?.frequency || 'Monthly'}
                chartDefinitionId={chartDef.chart_definition_id}
                {...(batchChartData.finalChartConfig && { finalChartConfig: batchChartData.finalChartConfig })}
                {...(batchChartData.runtimeFilters && { runtimeFilters: batchChartData.runtimeFilters })}
                {...navigationProps}
              />
            );

          case 'dual-axis':
            return (
              <DualAxisFullscreenModal
                isOpen={true}
                onClose={handleMobileFullscreenClose}
                chartTitle={chartDef.chart_name}
                chartData={batchChartData.chartData}
                chartDefinitionId={chartDef.chart_definition_id}
                {...(batchChartData.finalChartConfig && { finalChartConfig: batchChartData.finalChartConfig })}
                {...(batchChartData.runtimeFilters && { runtimeFilters: batchChartData.runtimeFilters })}
                {...navigationProps}
              />
            );

          case 'progress-bar':
            // Progress bar data is constructed from chartData labels and datasets
            return (
              <ProgressBarFullscreenModal
                isOpen={true}
                onClose={handleMobileFullscreenClose}
                chartTitle={chartDef.chart_name}
                data={batchChartData.chartData.labels.map((label, index) => ({
                  label: String(label),
                  value: ((batchChartData.chartData.datasets[0] as { rawValues?: number[] })?.rawValues?.[index] ?? 0),
                  percentage: (batchChartData.chartData.datasets[0]?.data[index] ?? 0) as number,
                }))}
                {...(batchChartData.chartData.datasets[0] && 'originalMeasureType' in batchChartData.chartData.datasets[0] && {
                  measureType: (batchChartData.chartData.datasets[0] as { originalMeasureType?: string }).originalMeasureType,
                })}
                chartDefinitionId={chartDef.chart_definition_id}
                {...(batchChartData.finalChartConfig && { finalChartConfig: batchChartData.finalChartConfig })}
                {...(batchChartData.runtimeFilters && { runtimeFilters: batchChartData.runtimeFilters })}
                {...navigationProps}
              />
            );

          case 'number':
            return (
              <NumberFullscreenModal
                isOpen={true}
                onClose={handleMobileFullscreenClose}
                chartTitle={chartDef.chart_name}
                data={batchChartData.chartData}
                {...navigationProps}
              />
            );

          case 'pie':
          case 'doughnut':
            return (
              <PieFullscreenModal
                isOpen={true}
                onClose={handleMobileFullscreenClose}
                chartTitle={chartDef.chart_name}
                data={batchChartData.chartData}
                chartType={chartDef.chart_type as 'pie' | 'doughnut'}
                {...navigationProps}
              />
            );

          case 'table':
            return (
              <TableFullscreenModal
                isOpen={true}
                onClose={handleMobileFullscreenClose}
                chartTitle={chartDef.chart_name}
                data={batchChartData.rawData || []}
                columns={batchChartData.columns || []}
                {...(batchChartData.formattedData && { formattedData: batchChartData.formattedData })}
                {...navigationProps}
              />
            );

          default:
            // Unknown chart type - no fullscreen modal
            return null;
        }
      })()}
    </div>
  );
}
