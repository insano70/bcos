'use client';

import { useState, useEffect, useRef } from 'react';
import AnalyticsChart from './analytics-chart';
import DashboardFilterDropdown from './dashboard-filter-dropdown';
import { type DashboardUniversalFilters, type DashboardFilterConfig } from './dashboard-filter-bar';
import type { Dashboard, DashboardChart, ChartDefinition, MeasureType, FrequencyType, ChartFilter } from '@/lib/types/analytics';
import { apiClient } from '@/lib/api/client';

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

export default function DashboardPreview({
  dashboard,
  dashboardCharts,
  dashboardConfig,
  filterConfig,
  onClose,
  title
}: DashboardPreviewProps) {
  const [availableCharts, setAvailableCharts] = useState<ChartDefinition[]>([]);
  const [isLoadingCharts, setIsLoadingCharts] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Phase 7: Preview filter state (non-functional, just visual)
  const [previewFilters, setPreviewFilters] = useState<DashboardUniversalFilters>(() => ({
    dateRangePreset: filterConfig?.defaultFilters?.dateRangePreset || 'last_30_days',
    organizationId: filterConfig?.defaultFilters?.organizationId,
  } as DashboardUniversalFilters));

  // Load available chart definitions for rendering
  useEffect(() => {
    loadChartDefinitions();
  }, []);

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
      setError('Failed to load chart definitions for preview');
    } finally {
      setIsLoadingCharts(false);
    }
  };

  // Determine which configuration to use
  const previewConfig = dashboardConfig || {
    dashboardName: dashboard?.dashboard_name || 'Unnamed Dashboard',
    dashboardDescription: dashboard?.dashboard_description || '',
    charts: dashboardCharts?.map((chartAssoc, index) => {
      const chartDefinition = availableCharts.find(chart => 
        chart.chart_definition_id === chartAssoc.chart_definition_id
      );
      
      return {
        id: `preview-chart-${index}`,
        chartDefinitionId: chartAssoc.chart_definition_id,
        position: chartAssoc.position_config,
        chartDefinition
      };
    }).filter(chart => chart.chartDefinition) || [],
    layout: {
      columns: dashboard?.layout_config?.columns || 12,
      rowHeight: dashboard?.layout_config?.rowHeight || 150,
      margin: dashboard?.layout_config?.margin || 10
    }
  };

  if (isLoadingCharts) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
        <span className="ml-3 text-gray-600 dark:text-gray-400">Loading preview...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6">
        <div className="flex items-center">
          <svg className="w-6 h-6 text-red-600 dark:text-red-400 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div>
            <h3 className="text-red-800 dark:text-red-200 font-medium">Preview Error</h3>
            <p className="text-red-600 dark:text-red-400 text-sm mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (previewConfig.charts.length === 0) {
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

  // Phase 7: Check if filter dropdown should be shown in preview
  const showFilterInPreview = filterConfig?.enabled !== false;

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
        {showFilterInPreview && filterConfig && (
          <DashboardFilterDropdown
            initialFilters={previewFilters}
            onFiltersChange={setPreviewFilters}
            loading={false}
            align="right"
          />
        )}
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
              {previewConfig.layout.columns} column grid • 
              {previewConfig.layout.rowHeight}px row height
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

          return (
            <div
              key={dashboardChart.id}
              className={`${colSpanClass} flex flex-col`}
              style={{ 
                marginBottom: `${previewConfig.layout.margin}px`,
                height: `${containerHeight}px`,
                maxHeight: `${containerHeight}px`,
                overflow: 'hidden'
              }}
            >
              <AnalyticsChart
                chartType={chartDef.chart_type as any}
                {...(measureFilter?.value && { measure: measureFilter.value as MeasureType })}
                {...(frequencyFilter?.value && { frequency: frequencyFilter.value as FrequencyType })}
                practice={practiceFilter?.value?.toString()}
                startDate={startDateFilter?.value?.toString()}
                endDate={endDateFilter?.value?.toString()}
                groupBy={chartConfig.series?.groupBy || 'provider_name'}
                title={chartDef.chart_name}
                calculatedField={(chartConfig as any).calculatedField}
                advancedFilters={(dataSource as any).advancedFilters || []}
                dataSourceId={(chartConfig as any).dataSourceId}
                stackingMode={(chartConfig as any).stackingMode}
                colorPalette={(chartConfig as any).colorPalette}
                {...((chartConfig as any).seriesConfigs && (chartConfig as any).seriesConfigs.length > 0 ? { multipleSeries: (chartConfig as any).seriesConfigs } : {})}
                {...((chartConfig as any).dualAxisConfig ? { dualAxisConfig: (chartConfig as any).dualAxisConfig } : {})}
                className="w-full h-full flex-1"
                responsive={true}
                minHeight={200}
                maxHeight={containerHeight - 100}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
