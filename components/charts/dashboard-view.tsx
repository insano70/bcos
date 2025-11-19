'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useDashboardData,
  type DashboardUniversalFilters,
} from '@/hooks/use-dashboard-data';
import { useStickyFilters } from '@/hooks/use-sticky-filters';
import { apiClient } from '@/lib/api/client';
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

interface DashboardViewProps {
  dashboard: Dashboard;
  dashboardCharts: DashboardChart[];
}

export default function DashboardView({ dashboard, dashboardCharts }: DashboardViewProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { loadPreferences, savePreferences, removeFilter } = useStickyFilters();
  const [availableCharts, setAvailableCharts] = useState<ChartDefinition[]>([]);
  const [isLoadingCharts, setIsLoadingCharts] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      setUniversalFilters(newFilters);
      updateUrlParams(newFilters);
      savePreferences(newFilters); // Save to localStorage
    },
    [updateUrlParams, savePreferences]
  );

  // Handle removing individual filter pill
  const handleRemoveFilter = useCallback(
    (filterKey: keyof DashboardUniversalFilters) => {
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
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to load chart definitions:', error);
      }
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
        <span className="ml-3 text-gray-600 dark:text-gray-400">
          {isLoadingCharts ? DASHBOARD_MESSAGES.LOADING.DASHBOARD : DASHBOARD_MESSAGES.LOADING.CHART_DATA}
        </span>
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
        {dashboardConfig.charts.map((dashboardChart) => {
          if (!dashboardChart.chartDefinition) {
            const colSpanClass = getResponsiveColSpan(dashboardChart.position.w);

            return (
              <div
                key={dashboardChart.id}
                className={`${colSpanClass} flex flex-col bg-white dark:bg-gray-800 shadow-sm rounded-xl border border-dashed border-gray-300 dark:border-gray-600`}
              >
                <div className="flex items-center justify-center h-48 text-center text-gray-500 dark:text-gray-400">
                  <div>
                    <div className="text-2xl mb-2">⚠️</div>
                    <p className="text-sm">{DASHBOARD_MESSAGES.ERRORS.CHART_NOT_FOUND}</p>
                    <p className="text-xs">ID: {dashboardChart.chartDefinitionId.slice(0, 8)}...</p>
                  </div>
                </div>
              </div>
            );
          }

          // Use pre-extracted configs from memoized dashboardConfig
          const chartDef = dashboardChart.chartDefinition;
          const chartConfig = dashboardChart.chartConfig;

          // Use responsive sizing that respects dashboard configuration
          const baseHeight = dashboardChart.position.h * DASHBOARD_LAYOUT.CHART.HEIGHT_MULTIPLIER;
          const containerHeight = Math.max(baseHeight, DASHBOARD_LAYOUT.CHART.MIN_HEIGHT);

          // Determine responsive column span classes
          const colSpanClass = getResponsiveColSpan(dashboardChart.position.w);

          // Get batch data for this chart
          const batchChartData = batchData?.charts[dashboardChart.chartDefinitionId];

          // Skip chart if no data returned from batch API
          if (!batchChartData) {
            return (
              <div
                key={dashboardChart.id}
                className={`${colSpanClass} flex flex-col bg-white dark:bg-gray-800 shadow-sm rounded-xl border border-dashed border-gray-300 dark:border-gray-600`}
              >
                <div className="flex items-center justify-center h-48 text-center text-gray-500 dark:text-gray-400">
                  <div>
                    <div className="text-2xl mb-2">⚠️</div>
                    <p className="text-sm">{DASHBOARD_MESSAGES.ERRORS.CHART_DATA_UNAVAILABLE}</p>
                    <p className="text-xs">ID: {dashboardChart.chartDefinitionId.slice(0, 8)}...</p>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div
              key={dashboardChart.id}
              className={`${colSpanClass} flex flex-col`}
              style={{
                marginBottom: `${dashboardConfig.layout.margin}px`,
                height: `${containerHeight}px`,
                maxHeight: `${containerHeight}px`,
                overflow: 'hidden',
              }}
            >
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
                  }}
                  position={dashboardChart.position}
                  currentFilters={universalFilters as Record<string, unknown>}
                  className="w-full h-full flex-1"
                  responsive={true}
                  minHeight={DASHBOARD_LAYOUT.CHART.MIN_HEIGHT_WITH_PADDING}
                  maxHeight={containerHeight - DASHBOARD_LAYOUT.CHART.HEIGHT_PADDING}
                  {...((chartDef.chart_type === 'bar' ||
                    chartDef.chart_type === 'stacked-bar' ||
                    chartDef.chart_type === 'horizontal-bar' ||
                    chartDef.chart_type === 'dual-axis') && {
                    onFullscreen: () => {}, // Will be handled by BatchChartRenderer internally
                  })}
                />
              </ChartErrorBoundary>
            </div>
          );
        })}
      </div>
    </div>
  );
}
