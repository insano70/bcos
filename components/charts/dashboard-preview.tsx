'use client';

import { useState, useEffect } from 'react';
import AnalyticsChart from './analytics-chart';
import type { Dashboard, DashboardChart, ChartDefinition } from '@/lib/types/analytics';

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
  
  // Navigation
  onClose: () => void;
  title?: string;
}

export default function DashboardPreview({
  dashboard,
  dashboardCharts,
  dashboardConfig,
  onClose,
  title
}: DashboardPreviewProps) {
  const [availableCharts, setAvailableCharts] = useState<ChartDefinition[]>([]);
  const [isLoadingCharts, setIsLoadingCharts] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load available chart definitions for rendering
  useEffect(() => {
    loadChartDefinitions();
  }, []);

  const loadChartDefinitions = async () => {
    try {
      const response = await fetch('/api/admin/analytics/charts?is_active=true');
      if (response.ok) {
        const result = await response.json();
        const charts = (result.data.charts || []).map((item: any) => {
          return item.chart_definitions || item;
        }).filter((chart: any) => chart.is_active !== false);
        
        setAvailableCharts(charts);
      }
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

  return (
    <div className="space-y-6">
      {/* Preview Header */}
      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-6">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
              {title || `Dashboard Preview: ${previewConfig.dashboardName}`}
            </h3>
            {previewConfig.dashboardDescription && (
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {previewConfig.dashboardDescription}
              </p>
            )}
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {previewConfig.charts.length} chart{previewConfig.charts.length !== 1 ? 's' : ''} • 
              {previewConfig.layout.columns} column grid • 
              {previewConfig.layout.rowHeight}px row height
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Close Preview
          </button>
        </div>
      </div>

      {/* Dashboard Grid Preview */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
        <div 
          className="grid auto-rows-min"
          style={{
            gridTemplateColumns: `repeat(${previewConfig.layout.columns}, 1fr)`,
            gap: `${previewConfig.layout.margin}px`,
            gridAutoRows: `${previewConfig.layout.rowHeight}px`
          }}
        >
          {previewConfig.charts.map((dashboardChart) => {
            if (!dashboardChart.chartDefinition) {
              return (
                <div
                  key={dashboardChart.id}
                  className="border border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex items-center justify-center bg-gray-50 dark:bg-gray-700"
                  style={{
                    gridColumn: `span ${Math.min(dashboardChart.position.w, previewConfig.layout.columns)}`,
                    gridRow: `span ${dashboardChart.position.h}`,
                    minHeight: `${dashboardChart.position.h * previewConfig.layout.rowHeight}px`
                  }}
                >
                  <div className="text-center text-gray-500 dark:text-gray-400">
                    <div className="text-2xl mb-2">⚠️</div>
                    <p className="text-sm">Chart Not Found</p>
                    <p className="text-xs">ID: {dashboardChart.chartDefinitionId.slice(0, 8)}...</p>
                  </div>
                </div>
              );
            }

            // Extract chart configuration for rendering
            const chartDef = dashboardChart.chartDefinition;
            const dataSource = chartDef.data_source || {};
            const chartConfig = chartDef.chart_config || {};
            
            // Extract filters to get chart parameters
            const measureFilter = dataSource.filters?.find((f: any) => f.field === 'measure');
            const frequencyFilter = dataSource.filters?.find((f: any) => f.field === 'frequency');
            const practiceFilter = dataSource.filters?.find((f: any) => f.field === 'practice_uid');
            const startDateFilter = dataSource.filters?.find((f: any) => f.field === 'date_index' && f.operator === 'gte');
            const endDateFilter = dataSource.filters?.find((f: any) => f.field === 'date_index' && f.operator === 'lte');

            return (
              <div
                key={dashboardChart.id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
                style={{
                  gridColumn: `span ${Math.min(dashboardChart.position.w, previewConfig.layout.columns)}`,
                  gridRow: `span ${dashboardChart.position.h}`,
                  minHeight: `${dashboardChart.position.h * previewConfig.layout.rowHeight}px`
                }}
              >
                <AnalyticsChart
                  chartType={chartDef.chart_type as any}
                  measure={measureFilter?.value}
                  frequency={frequencyFilter?.value}
                  practice={practiceFilter?.value?.toString()}
                  startDate={startDateFilter?.value}
                  endDate={endDateFilter?.value}
                  groupBy={chartConfig.series?.groupBy || 'provider_name'}
                  width={Math.floor((dashboardChart.position.w / previewConfig.layout.columns) * 800)}
                  height={dashboardChart.position.h * previewConfig.layout.rowHeight - 20}
                  title={chartDef.chart_name}
                  calculatedField={(chartConfig as any).calculatedField}
                  advancedFilters={(dataSource as any).advancedFilters || []}
                  {...((chartConfig as any).seriesConfigs && (chartConfig as any).seriesConfigs.length > 0 ? { multipleSeries: (chartConfig as any).seriesConfigs } : {})}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
