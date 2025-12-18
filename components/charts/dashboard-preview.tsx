'use client';

import { BarChart3, LayoutGrid } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { DashboardUniversalFilters } from '@/hooks/useDashboardData';
import { apiClient } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import type {
  ChartDefinition,
  ChartFilter,
  Dashboard,
  DashboardChart,
  DashboardFilterConfig,
  FrequencyType,
  MeasureType,
} from '@/lib/types/analytics';
import AnalyticsChart from './analytics-chart';
import { clientErrorLog } from '@/lib/utils/debug-client';
import DashboardFilterDropdown from './dashboard-filter-dropdown';
import { InlineAlert } from '@/components/ui/inline-alert';

interface DashboardConfig {
  dashboardName: string;
  dashboardDescription: string;
  charts: Array<{
    id: string;
    chartDefinitionId: string;
    position: { x: number; y: number; w: number; h: number };
    chartDefinition?: ChartDefinition;
  }>;
  layout: {
    columns: number;
    rowHeight: number;
    margin: number;
  };
}

interface DashboardPreviewProps {
  // For previewing saved dashboards (from list)
  dashboard?: Dashboard;
  dashboardCharts?: DashboardChart[];

  // For previewing unsaved configurations (from builder)
  dashboardConfig?: DashboardConfig;

  // Phase 7: Filter configuration preview
  filterConfig?: DashboardFilterConfig;

  // Navigation
  onClose: () => void;
  title?: string;
}

/**
 * Chart Preview Placeholder
 * Shows chart info with a "Load Preview" button instead of auto-loading data
 */
interface ChartPlaceholderProps {
  chartName: string;
  chartType: string;
  onLoad: () => void;
  isLoading: boolean;
}

function ChartPreviewPlaceholder({ chartName, chartType, onLoad, isLoading }: ChartPlaceholderProps) {
  return (
    <div className="h-full w-full bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col">
      {/* Header mimics chart header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
          {chartName}
        </h3>
        <Badge color="gray" size="sm" shape="rounded">{chartType}</Badge>
      </div>
      
      {/* Placeholder content with load button */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <BarChart3 className="w-10 h-10 text-gray-400 dark:text-gray-500 opacity-50 mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Chart preview not loaded
        </p>
        <button
          type="button"
          onClick={onLoad}
          disabled={isLoading}
          className="px-4 py-2 bg-violet-500 hover:bg-violet-600 disabled:bg-violet-400 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          {isLoading ? (
            <>
              <Spinner size="sm" trackClassName="border-white/30" indicatorClassName="border-white" />
              Loading...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Load Preview
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default function DashboardPreview({
  dashboard,
  dashboardCharts,
  dashboardConfig,
  filterConfig,
  onClose: _onClose,
  title: _title,
}: DashboardPreviewProps) {
  const [availableCharts, setAvailableCharts] = useState<ChartDefinition[]>([]);
  const [isLoadingCharts, setIsLoadingCharts] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Track which charts have been loaded (by chart id)
  const [loadedChartIds, setLoadedChartIds] = useState<Set<string>>(new Set());
  // Track which charts are currently loading
  const [loadingChartIds, setLoadingChartIds] = useState<Set<string>>(new Set());

  // Phase 7: Preview filter state (non-functional, just visual)
  const [previewFilters, setPreviewFilters] = useState<DashboardUniversalFilters>(
    () =>
      ({
        dateRangePreset: filterConfig?.defaultFilters?.dateRangePreset || 'last_30_days',
        organizationId: filterConfig?.defaultFilters?.organizationId,
      }) as DashboardUniversalFilters
  );

  // Load available chart definitions for rendering
  useEffect(() => {
    loadChartDefinitions();
  }, []);

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
    } catch (err) {
      clientErrorLog('Failed to load chart definitions:', err);
      setError('Failed to load chart definitions for preview');
    } finally {
      setIsLoadingCharts(false);
    }
  };

  // Handle loading a single chart
  const handleLoadChart = useCallback((chartId: string) => {
    // Mark as loading
    setLoadingChartIds(prev => new Set(prev).add(chartId));
    
    // Small delay to show loading state, then mark as loaded
    // The actual loading happens when AnalyticsChart mounts
    setTimeout(() => {
      setLoadedChartIds(prev => new Set(prev).add(chartId));
      setLoadingChartIds(prev => {
        const next = new Set(prev);
        next.delete(chartId);
        return next;
      });
    }, 100);
  }, []);

  // Handle loading all charts at once
  const handleLoadAllCharts = useCallback(() => {
    const allChartIds = previewConfig?.charts.map(c => c.id) || [];
    for (const id of allChartIds) {
      handleLoadChart(id);
    }
  }, [handleLoadChart]);

  // Determine which configuration to use
  const previewConfig = dashboardConfig || {
    dashboardName: dashboard?.dashboard_name || 'Unnamed Dashboard',
    dashboardDescription: dashboard?.dashboard_description || '',
    charts:
      dashboardCharts
        ?.map((chartAssoc, index) => {
          const chartDefinition = availableCharts.find(
            (chart) => chart.chart_definition_id === chartAssoc.chart_definition_id
          );

          return {
            id: `preview-chart-${index}`,
            chartDefinitionId: chartAssoc.chart_definition_id,
            position: chartAssoc.position_config,
            chartDefinition,
          };
        })
        .filter((chart) => chart.chartDefinition) || [],
    layout: {
      columns: dashboard?.layout_config?.columns || 12,
      rowHeight: dashboard?.layout_config?.rowHeight || 150,
      margin: dashboard?.layout_config?.margin || 10,
    },
  };

  if (isLoadingCharts) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <Spinner size="md" />
        <span className="ml-3 text-gray-600 dark:text-gray-400">Loading preview...</span>
      </div>
    );
  }

  if (error) {
    return (
      <InlineAlert type="error" title="Preview Error">
        {error}
      </InlineAlert>
    );
  }

  if (previewConfig.charts.length === 0) {
    return (
      <EmptyState
        icon={LayoutGrid}
        iconSize="lg"
        title="Empty Dashboard"
        description="This dashboard doesn't have any charts yet."
        className="py-12"
      />
    );
  }

  // Phase 7: Check if filter dropdown should be shown in preview
  const showFilterInPreview = filterConfig?.enabled !== false;
  const loadedCount = loadedChartIds.size;
  const totalCount = previewConfig.charts.length;

  return (
    <div className="space-y-4">
      {/* Compact Title Row with Filter Icon */}
      <div className="flex items-center justify-between px-4 pt-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {previewConfig.dashboardName}
          </h1>
          {/* Preview Mode Badge */}
          <div className="inline-block mt-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 text-xs px-2 py-1 rounded border border-yellow-300 dark:border-yellow-700">
            Preview Mode
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Load All Charts button */}
          {loadedCount < totalCount && (
            <button
              type="button"
              onClick={handleLoadAllCharts}
              className="px-3 py-1.5 bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Load All Charts ({totalCount - loadedCount} remaining)
            </button>
          )}
          {loadedCount === totalCount && totalCount > 0 && (
            <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              All charts loaded
            </span>
          )}
          {showFilterInPreview && filterConfig && (
            <DashboardFilterDropdown
              initialFilters={previewFilters}
              onFiltersChange={setPreviewFilters}
              loading={false}
              align="right"
            />
          )}
        </div>
      </div>

      {/* Preview Info - Description and Stats Only */}
      {(previewConfig.dashboardDescription || previewConfig.charts.length > 0) && (
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 mx-4">
          <div>
            {previewConfig.dashboardDescription && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {previewConfig.dashboardDescription}
              </p>
            )}
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {previewConfig.charts.length} chart{previewConfig.charts.length !== 1 ? 's' : ''} •
              {previewConfig.layout.columns} column grid • {previewConfig.layout.rowHeight}px row
              height • {loadedCount}/{totalCount} loaded
            </div>
          </div>
        </div>
      )}

      {/* Dashboard Grid Preview - Following /dashboard pattern */}
      <div className="grid grid-cols-12 gap-6 w-full p-4">
        {previewConfig.charts.map((dashboardChart) => {
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

          // Extract chart configuration for rendering
          const chartDef = dashboardChart.chartDefinition;
          const dataSource = chartDef.data_source || {};
          const chartConfig = chartDef.chart_config || {};

          // Extract filters to get chart parameters
          const measureFilter = dataSource.filters?.find((f: ChartFilter) => f.field === 'measure');
          const frequencyFilter = dataSource.filters?.find(
            (f: ChartFilter) => f.field === 'frequency'
          );
          const practiceFilter = dataSource.filters?.find(
            (f: ChartFilter) => f.field === 'practice_uid'
          );
          const startDateFilter = dataSource.filters?.find(
            (f: ChartFilter) => f.field === 'date_index' && f.operator === 'gte'
          );
          const endDateFilter = dataSource.filters?.find(
            (f: ChartFilter) => f.field === 'date_index' && f.operator === 'lte'
          );

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

          const isLoaded = loadedChartIds.has(dashboardChart.id);
          const isLoading = loadingChartIds.has(dashboardChart.id);

          return (
            <div
              key={dashboardChart.id}
              className={`${colSpanClass} flex flex-col`}
              style={{
                marginBottom: `${previewConfig.layout.margin}px`,
                height: `${containerHeight}px`,
                maxHeight: `${containerHeight}px`,
                overflow: 'hidden',
              }}
            >
              {isLoaded ? (
                <AnalyticsChart
                  chartType={chartDef.chart_type}
                  {...(measureFilter?.value && { measure: measureFilter.value as MeasureType })}
                  {...(frequencyFilter?.value && {
                    frequency: frequencyFilter.value as FrequencyType,
                  })}
                  practice={practiceFilter?.value?.toString()}
                  startDate={startDateFilter?.value?.toString()}
                  endDate={endDateFilter?.value?.toString()}
                  groupBy={chartConfig.series?.groupBy || 'provider_name'}
                  title={chartDef.chart_name}
                  calculatedField={chartConfig.calculatedField}
                  advancedFilters={dataSource.advancedFilters || []}
                  dataSourceId={chartConfig.dataSourceId}
                  stackingMode={chartConfig.stackingMode}
                  colorPalette={chartConfig.colorPalette}
                  {...(chartConfig.seriesConfigs && chartConfig.seriesConfigs.length > 0
                    ? { multipleSeries: chartConfig.seriesConfigs }
                    : {})}
                  {...(chartConfig.dualAxisConfig
                    ? { dualAxisConfig: chartConfig.dualAxisConfig }
                    : {})}
                  className="w-full h-full flex-1"
                  responsive={true}
                  minHeight={200}
                  maxHeight={containerHeight - 100}
                />
              ) : (
                <ChartPreviewPlaceholder
                  chartName={chartDef.chart_name}
                  chartType={chartDef.chart_type}
                  onLoad={() => handleLoadChart(dashboardChart.id)}
                  isLoading={isLoading}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
