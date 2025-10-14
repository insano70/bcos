'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import AnalyticsChart from './analytics-chart';
import BatchChartRenderer, { type BatchChartData } from './batch-chart-renderer';
import DashboardFilterDropdown from './dashboard-filter-dropdown';
import { type DashboardUniversalFilters } from './dashboard-filter-bar';
import { useDashboardData } from '@/hooks/use-dashboard-data';
import type { Dashboard, DashboardChart, ChartDefinition, MeasureType, FrequencyType, ChartFilter } from '@/lib/types/analytics';
import { apiClient } from '@/lib/api/client';

interface DashboardViewProps {
  dashboard: Dashboard;
  dashboardCharts: DashboardChart[];
}

export default function DashboardView({
  dashboard,
  dashboardCharts
}: DashboardViewProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [availableCharts, setAvailableCharts] = useState<ChartDefinition[]>([]);
  const [isLoadingCharts, setIsLoadingCharts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Phase 7: Check dashboard configuration
  const layoutConfig = dashboard.layout_config as any;
  const filterConfig = layoutConfig?.filterConfig;
  const showFilterBar = filterConfig?.enabled !== false; // Default to true if not specified
  
  // Phase 7: Batch rendering feature flag (default: false for gradual rollout)
  const useBatchRendering = layoutConfig?.useBatchRendering === true;

  // Phase 7: Dashboard-level universal filters with default values
  // Priority: URL params > default filters from config > system defaults
  const [universalFilters, setUniversalFilters] = useState<DashboardUniversalFilters>(() => {
    const practice = searchParams.get('practice');
    const defaultFilters = filterConfig?.defaultFilters || {};

    return {
      // URL params take highest priority, then default config, then system defaults
      dateRangePreset: searchParams.get('datePreset') || defaultFilters.dateRangePreset || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      organizationId: searchParams.get('org') || defaultFilters.organizationId || undefined,
      practiceUids: practice ? [parseInt(practice, 10)] : undefined,
      providerName: searchParams.get('provider') || undefined,
    } as DashboardUniversalFilters;
  });

  // Phase 7: URL param management
  const updateUrlParams = useCallback((filters: DashboardUniversalFilters) => {
    const params = new URLSearchParams();
    
    if (filters.dateRangePreset) params.set('datePreset', filters.dateRangePreset);
    if (filters.startDate) params.set('startDate', filters.startDate);
    if (filters.endDate) params.set('endDate', filters.endDate);
    if (filters.organizationId) params.set('org', filters.organizationId);
    if (filters.practiceUids && filters.practiceUids.length > 0 && filters.practiceUids[0] !== undefined) {
      params.set('practice', filters.practiceUids[0].toString());
    }
    if (filters.providerName) params.set('provider', filters.providerName);
    
    // Update URL without scroll, preserving history
    router.push(`?${params.toString()}`, { scroll: false });
  }, [router]);

  // Phase 7: Handle filter changes
  const handleFilterChange = useCallback((newFilters: DashboardUniversalFilters) => {
    setUniversalFilters(newFilters);
    updateUrlParams(newFilters);
  }, [updateUrlParams]);

  const loadChartDefinitions = async () => {
    try {
      const result = await apiClient.get<{
        charts: ChartDefinition[];
      }>('/api/admin/analytics/charts?is_active=true');
      const charts = (result.charts || []).map((item: ChartDefinition) => {
        return (item as any).chart_definitions || item;
      }).filter((chart: ChartDefinition) => chart.is_active !== false);
      
      setAvailableCharts(charts);
    } catch (error) {
      console.error('Failed to load chart definitions:', error);
      setError('Failed to load chart definitions for dashboard');
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

  // Phase 7: Batch rendering data (only if batch mode enabled)
  const { 
    data: batchData, 
    isLoading: isBatchLoading, 
    error: batchError,
    refetch: refetchBatch,
    metrics: batchMetrics
  } = useDashboardData({
    dashboardId: dashboard.dashboard_id,
    universalFilters,
    enabled: useBatchRendering && !isLoadingCharts, // Only fetch after chart definitions loaded
  });

  // Create dashboard configuration from saved dashboard data
  // Memoized to prevent unnecessary re-renders and duplicate chart loads
  const dashboardConfig = useMemo(() => ({
    dashboardName: dashboard.dashboard_name || 'Unnamed Dashboard',
    dashboardDescription: dashboard.dashboard_description || '',
    charts: dashboardCharts?.map((chartAssoc, index) => {
      const chartDefinition = availableCharts.find(chart => 
        chart.chart_definition_id === chartAssoc.chart_definition_id
      );
      
      // Extract and stabilize config objects to prevent duplicate renders
      const dataSource = chartDefinition?.data_source || {};
      const chartConfig = chartDefinition?.chart_config || {};
      
      return {
        id: `dashboard-chart-${index}`,
        chartDefinitionId: chartAssoc.chart_definition_id,
        position: chartAssoc.position_config,
        chartDefinition,
        // Pre-extract configs to stabilize object references
        dataSource,
        chartConfig,
      };
    }).filter(chart => chart.chartDefinition) || [],
    layout: {
      columns: layoutConfig?.columns || 12,
      rowHeight: layoutConfig?.rowHeight || 150,
      margin: layoutConfig?.margin || 10
    }
  }), [dashboard, dashboardCharts, availableCharts, layoutConfig]);

  // Phase 7: Combined loading state (chart definitions + batch data)
  const isLoading = isLoadingCharts || (useBatchRendering && isBatchLoading);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
        <span className="ml-3 text-gray-600 dark:text-gray-400">
          {isLoadingCharts ? 'Loading dashboard...' : 'Loading chart data...'}
        </span>
      </div>
    );
  }

  // Phase 7: Handle batch error (fallback to individual fetching)
  if (useBatchRendering && batchError) {
    console.warn('[Dashboard] Batch rendering failed, falling back to individual fetching', {
      dashboardId: dashboard.dashboard_id,
      error: batchError,
    });
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
        <div className="flex items-center">
          <svg className="w-6 h-6 text-red-600 dark:text-red-400 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
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
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Empty Dashboard</h3>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          This dashboard doesn't have any charts yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compact Title Row with Filter Icon */}
      <div className="flex items-center justify-between px-4 pt-4">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          {dashboardConfig.dashboardName}
        </h1>
        {showFilterBar && (
          <DashboardFilterDropdown
            initialFilters={universalFilters}
            onFiltersChange={handleFilterChange}
            loading={isLoading}
            align="right"
          />
        )}
      </div>

      {/* Phase 7: Performance Metrics (dev mode only) */}
      {process.env.NODE_ENV === 'development' && useBatchRendering && batchMetrics && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mx-4">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <span className="font-medium text-blue-900 dark:text-blue-100">
                ⚡ Batch
              </span>
              <span className="text-blue-700 dark:text-blue-300">
                {batchMetrics.totalTime}ms
              </span>
              <span className="text-blue-700 dark:text-blue-300">
                {batchMetrics.cacheHitRate}% cache
              </span>
              <span className="text-blue-700 dark:text-blue-300">
                {batchMetrics.chartsRendered} charts
              </span>
            </div>
            <button
              onClick={() => refetchBatch(true)}
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
            // Determine responsive column span classes like dashboard cards
            let colSpanClass = 'col-span-full';
            if (dashboardChart.position.w <= 4) {
              colSpanClass = 'col-span-full sm:col-span-6 xl:col-span-4';
            } else if (dashboardChart.position.w <= 6) {
              colSpanClass = 'col-span-full sm:col-span-6';
            } else if (dashboardChart.position.w <= 8) {
              colSpanClass = 'col-span-full lg:col-span-8';
            } else {
              colSpanClass = 'col-span-full';
            }

            return (
              <div
                key={dashboardChart.id}
                className={`${colSpanClass} flex flex-col bg-white dark:bg-gray-800 shadow-sm rounded-xl border border-dashed border-gray-300 dark:border-gray-600`}
              >
                <div className="flex items-center justify-center h-48 text-center text-gray-500 dark:text-gray-400">
                  <div>
                    <div className="text-2xl mb-2">⚠️</div>
                    <p className="text-sm">Chart Not Found</p>
                    <p className="text-xs">ID: {dashboardChart.chartDefinitionId.slice(0, 8)}...</p>
                  </div>
                </div>
              </div>
            );
          }

          // Use pre-extracted configs from memoized dashboardConfig
          const chartDef = dashboardChart.chartDefinition;
          const dataSource = dashboardChart.dataSource as any;
          const chartConfig = dashboardChart.chartConfig as any;
          
          // Extract filters to get chart parameters
          const measureFilter = dataSource.filters?.find((f: ChartFilter) => f.field === 'measure');
          const frequencyFilter = dataSource.filters?.find((f: ChartFilter) => f.field === 'frequency');
          const practiceFilter = dataSource.filters?.find((f: ChartFilter) => f.field === 'practice_uid');
          const startDateFilter = dataSource.filters?.find((f: ChartFilter) => f.field === 'date_index' && f.operator === 'gte');
          const endDateFilter = dataSource.filters?.find((f: ChartFilter) => f.field === 'date_index' && f.operator === 'lte');

          // Use responsive sizing that respects dashboard configuration
          const baseHeight = dashboardChart.position.h * 150; // Height from dashboard configuration
          const containerHeight = Math.max(baseHeight, 250); // Minimum reasonable height
          
          // Determine responsive column span classes like dashboard cards
          let colSpanClass = 'col-span-full';
          if (dashboardChart.position.w <= 4) {
            colSpanClass = 'col-span-full sm:col-span-6 xl:col-span-4';
          } else if (dashboardChart.position.w <= 6) {
            colSpanClass = 'col-span-full sm:col-span-6';
          } else if (dashboardChart.position.w <= 8) {
            colSpanClass = 'col-span-full lg:col-span-8';
          } else {
            colSpanClass = 'col-span-full';
          }

          // Phase 7: Check if we have batch data for this chart
          const batchChartData = useBatchRendering && batchData && !batchError
            ? batchData.charts[dashboardChart.chartDefinitionId]
            : null;

          return (
            <div
              key={dashboardChart.id}
              className={`${colSpanClass} flex flex-col`}
              style={{ 
                marginBottom: `${dashboardConfig.layout.margin}px`,
                height: `${containerHeight}px`,
                maxHeight: `${containerHeight}px`,
                overflow: 'hidden'
              }}
            >
              {/* Phase 7: Render with batch data if available, otherwise fallback to individual fetching */}
              {batchChartData ? (
                <BatchChartRenderer
                  chartData={batchChartData as BatchChartData}
                  chartDefinition={{
                    chart_definition_id: chartDef.chart_definition_id,
                    chart_name: chartDef.chart_name,
                    chart_type: chartDef.chart_type,
                    chart_config: chartConfig,
                  }}
                  position={dashboardChart.position}
                  className="w-full h-full flex-1"
                  responsive={true}
                  minHeight={200}
                  maxHeight={containerHeight - 100}
                />
              ) : (
                <AnalyticsChart
                  chartType={chartDef.chart_type as any}
                  {...(measureFilter?.value && { measure: measureFilter.value as MeasureType })}
                  {...(frequencyFilter?.value && { frequency: frequencyFilter.value as FrequencyType })}
                  practice={practiceFilter?.value?.toString()}
                  // Phase 7: Dashboard filters override chart filters
                  startDate={universalFilters.startDate || startDateFilter?.value?.toString()}
                  endDate={universalFilters.endDate || endDateFilter?.value?.toString()}
                  groupBy={chartConfig.series?.groupBy || 'none'}
                  title={chartDef.chart_name}
                  calculatedField={chartConfig.calculatedField}
                  advancedFilters={dataSource.advancedFilters || []}
                  dataSourceId={chartConfig.dataSourceId}
                  stackingMode={chartConfig.stackingMode}
                  colorPalette={chartConfig.colorPalette}
                  {...(chartConfig.seriesConfigs && chartConfig.seriesConfigs.length > 0 ? { multipleSeries: chartConfig.seriesConfigs } : {})}
                  {...(chartConfig.dualAxisConfig ? { dualAxisConfig: chartConfig.dualAxisConfig } : {})}
                  {...(chartConfig.target && { target: chartConfig.target })}
                  {...(chartConfig.aggregation && { aggregation: chartConfig.aggregation })}
                  className="w-full h-full flex-1"
                  responsive={true}
                  minHeight={200}
                  maxHeight={containerHeight - 100}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
