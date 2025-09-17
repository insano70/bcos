'use client';

import { useState, useEffect } from 'react';
import { ChartDefinition } from '@/lib/types/analytics';
import AnalyticsChart from './analytics-chart';
import Toast from '@/components/toast';

/**
 * Advanced Dashboard Builder
 * Multi-chart dashboard builder with drag-and-drop layout as specified in design document
 */

interface DashboardChart {
  id: string;
  chartDefinitionId: string;
  position: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  chartDefinition?: ChartDefinition;
}

interface DashboardConfig {
  dashboardName: string;
  dashboardDescription: string;
  charts: DashboardChart[];
  layout: {
    columns: number;
    rowHeight: number;
    margin: number;
  };
}

export default function AdvancedDashboardBuilder() {
  const [dashboardConfig, setDashboardConfig] = useState<DashboardConfig>({
    dashboardName: '',
    dashboardDescription: '',
    charts: [],
    layout: {
      columns: 12,
      rowHeight: 150,
      margin: 10
    }
  });

  const [availableCharts, setAvailableCharts] = useState<ChartDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [draggedChart, setDraggedChart] = useState<ChartDefinition | null>(null);

  useEffect(() => {
    loadAvailableCharts();
  }, []);

  const loadAvailableCharts = async () => {
    try {
      const response = await fetch('/api/admin/analytics/charts');
      if (response.ok) {
        const result = await response.json();
        setAvailableCharts(result.data.charts || []);
      }
    } catch (error) {
      console.error('Failed to load charts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const addChartToDashboard = (chartDefinition: ChartDefinition) => {
    const newChart: DashboardChart = {
      id: `dashboard_chart_${Date.now()}`,
      chartDefinitionId: chartDefinition.chart_definition_id,
      position: {
        x: 0,
        y: dashboardConfig.charts.length * 4, // Stack vertically by default
        w: 6, // Half width
        h: 4  // Standard height
      },
      chartDefinition
    };

    setDashboardConfig(prev => ({
      ...prev,
      charts: [...prev.charts, newChart]
    }));
  };

  const removeChartFromDashboard = (chartId: string) => {
    setDashboardConfig(prev => ({
      ...prev,
      charts: prev.charts.filter(chart => chart.id !== chartId)
    }));
  };

  const updateChartPosition = (chartId: string, position: Partial<DashboardChart['position']>) => {
    setDashboardConfig(prev => ({
      ...prev,
      charts: prev.charts.map(chart =>
        chart.id === chartId
          ? { ...chart, position: { ...chart.position, ...position } }
          : chart
      )
    }));
  };

  const saveDashboard = async () => {
    if (!dashboardConfig.dashboardName.trim()) {
      setToastMessage('Dashboard name is required');
      setToastType('error');
      setShowToast(true);
      return;
    }

    setIsSaving(true);

    try {
      const dashboardDefinition = {
        dashboard_name: dashboardConfig.dashboardName,
        dashboard_description: dashboardConfig.dashboardDescription,
        layout_config: {
          columns: dashboardConfig.layout.columns,
          rowHeight: dashboardConfig.layout.rowHeight,
          margin: dashboardConfig.layout.margin
        },
        chart_ids: dashboardConfig.charts.map(chart => chart.chartDefinitionId),
        chart_positions: dashboardConfig.charts.map(chart => chart.position)
      };

      const response = await fetch('/api/admin/analytics/dashboards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dashboardDefinition)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save dashboard');
      }

      setToastMessage(`Dashboard "${dashboardConfig.dashboardName}" saved successfully!`);
      setToastType('success');
      setShowToast(true);

      // Reset form
      setDashboardConfig({
        dashboardName: '',
        dashboardDescription: '',
        charts: [],
        layout: {
          columns: 12,
          rowHeight: 150,
          margin: 10
        }
      });

    } catch (error) {
      setToastMessage(`Failed to save dashboard: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setToastType('error');
      setShowToast(true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDragStart = (chart: ChartDefinition) => {
    setDraggedChart(chart);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (draggedChart) {
      addChartToDashboard(draggedChart);
      setDraggedChart(null);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto bg-white dark:bg-gray-800 shadow-sm rounded-xl p-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
          <span className="ml-3 text-gray-600 dark:text-gray-400">Loading dashboard builder...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto bg-white dark:bg-gray-800 shadow-sm rounded-xl">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Dashboard Builder
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Create multi-chart dashboards with drag-and-drop layout
        </p>
      </div>

      <div className="flex">
        {/* Chart Library Sidebar */}
        <div className="w-1/3 border-r border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            Available Charts
          </h3>
          
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {availableCharts.map((chart) => (
              <div
                key={chart.chart_definition_id}
                draggable
                onDragStart={() => handleDragStart(chart)}
                className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-move hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                  {chart.chart_name}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {chart.chart_type} chart
                </div>
                {chart.chart_description && (
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {chart.chart_description}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Dashboard Configuration */}
        <div className="flex-1 p-6">
          {/* Dashboard Settings */}
          <div className="mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Dashboard Name *
                </label>
                <input
                  type="text"
                  value={dashboardConfig.dashboardName}
                  onChange={(e) => setDashboardConfig(prev => ({ ...prev, dashboardName: e.target.value }))}
                  placeholder="Enter dashboard name"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description
                </label>
                <input
                  type="text"
                  value={dashboardConfig.dashboardDescription}
                  onChange={(e) => setDashboardConfig(prev => ({ ...prev, dashboardDescription: e.target.value }))}
                  placeholder="Dashboard description"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>
          </div>

          {/* Dashboard Canvas */}
          <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 min-h-96">
            <div
              className="w-full h-full"
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              {dashboardConfig.charts.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                  <div className="text-center">
                    <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2h4a1 1 0 011 1v1a1 1 0 01-1 1v10a2 2 0 01-2 2H4a2 2 0 01-2-2V7a1 1 0 01-1-1V5a1 1 0 011-1h4zM9 3v1h6V3H9zM4 7v11h16V7H4z" />
                    </svg>
                    <p className="text-lg font-medium mb-2">Empty Dashboard</p>
                    <p className="text-sm">Drag charts from the sidebar to add them to your dashboard</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-12 gap-4">
                  {dashboardConfig.charts.map((dashboardChart) => (
                    <div
                      key={dashboardChart.id}
                      className={`col-span-${dashboardChart.position.w} border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-700`}
                      style={{
                        gridColumn: `span ${dashboardChart.position.w}`,
                        minHeight: `${dashboardChart.position.h * 100}px`
                      }}
                    >
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                          {dashboardChart.chartDefinition?.chart_name}
                        </h4>
                        <button
                          onClick={() => removeChartFromDashboard(dashboardChart.id)}
                          className="text-red-500 hover:text-red-700 text-sm"
                        >
                          ×
                        </button>
                      </div>
                      
                      {/* Chart Size Controls */}
                      <div className="flex gap-2 mb-3">
                        <button
                          onClick={() => updateChartPosition(dashboardChart.id, { w: 6 })}
                          className={`px-2 py-1 text-xs rounded ${dashboardChart.position.w === 6 ? 'bg-violet-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                        >
                          Half
                        </button>
                        <button
                          onClick={() => updateChartPosition(dashboardChart.id, { w: 8 })}
                          className={`px-2 py-1 text-xs rounded ${dashboardChart.position.w === 8 ? 'bg-violet-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                        >
                          Large
                        </button>
                        <button
                          onClick={() => updateChartPosition(dashboardChart.id, { w: 12 })}
                          className={`px-2 py-1 text-xs rounded ${dashboardChart.position.w === 12 ? 'bg-violet-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                        >
                          Full
                        </button>
                      </div>

                      {/* Chart Preview */}
                      <div className="bg-gray-50 dark:bg-gray-600 rounded p-2 h-32 flex items-center justify-center">
                        <div className="text-center text-gray-500 dark:text-gray-400">
                          <div className="text-sm font-medium">
                            {dashboardChart.chartDefinition?.chart_type} Chart
                          </div>
                          <div className="text-xs">
                            {dashboardChart.chartDefinition?.chart_description}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Dashboard Actions */}
          <div className="flex justify-between items-center mt-6">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {dashboardConfig.charts.length} chart(s) in dashboard
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => setDashboardConfig(prev => ({ ...prev, charts: [] }))}
                disabled={dashboardConfig.charts.length === 0}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
              >
                Clear All
              </button>
              
              <button
                onClick={saveDashboard}
                disabled={!dashboardConfig.dashboardName.trim() || dashboardConfig.charts.length === 0 || isSaving}
                className="px-6 py-2 bg-violet-500 text-white rounded-md hover:bg-violet-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save Dashboard'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Layout Configuration Panel */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4">
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 group-open:text-violet-600 dark:group-open:text-violet-400">
            ⚙️ Layout Configuration
          </summary>
          
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Grid Columns
              </label>
              <input
                type="number"
                min="6"
                max="24"
                value={dashboardConfig.layout.columns}
                onChange={(e) => setDashboardConfig(prev => ({
                  ...prev,
                  layout: { ...prev.layout, columns: parseInt(e.target.value) || 12 }
                }))}
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Row Height (px)
              </label>
              <input
                type="number"
                min="100"
                max="300"
                value={dashboardConfig.layout.rowHeight}
                onChange={(e) => setDashboardConfig(prev => ({
                  ...prev,
                  layout: { ...prev.layout, rowHeight: parseInt(e.target.value) || 150 }
                }))}
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Margin (px)
              </label>
              <input
                type="number"
                min="0"
                max="50"
                value={dashboardConfig.layout.margin}
                onChange={(e) => setDashboardConfig(prev => ({
                  ...prev,
                  layout: { ...prev.layout, margin: parseInt(e.target.value) || 10 }
                }))}
                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
        </details>
      </div>

      {/* Toast Notification */}
      <Toast
        type={toastType}
        open={showToast}
        setOpen={setShowToast}
        className="fixed bottom-4 right-4 z-50"
      >
        {toastMessage}
      </Toast>
    </div>
  );
}
