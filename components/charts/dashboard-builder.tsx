'use client';

import React, { useState, useEffect } from 'react';

/**
 * Dashboard Builder Component
 * Multi-chart dashboard composition with drag-and-drop layout
 */

interface DashboardBuilderProps {
  onSave?: (dashboard: any) => void;
  onCancel?: () => void;
  initialDashboard?: any;
}

interface ChartItem {
  chart_definition_id: string;
  chart_name: string;
  chart_type: string;
  chart_description?: string;
}

interface DashboardChart {
  chart_definition_id: string;
  chart_name: string;
  chart_type: string;
  position: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export default function DashboardBuilder({ 
  onSave, 
  onCancel, 
  initialDashboard 
}: DashboardBuilderProps) {
  const [dashboardName, setDashboardName] = useState(initialDashboard?.dashboard_name || '');
  const [dashboardDescription, setDashboardDescription] = useState(initialDashboard?.dashboard_description || '');
  const [availableCharts, setAvailableCharts] = useState<ChartItem[]>([]);
  const [selectedCharts, setSelectedCharts] = useState<DashboardChart[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load available charts
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
    }
  };

  const addChartToDashboard = (chart: ChartItem) => {
    // Find next available position
    const nextY = selectedCharts.length > 0 
      ? Math.max(...selectedCharts.map(c => c.position.y + c.position.h))
      : 0;

    const dashboardChart: DashboardChart = {
      chart_definition_id: chart.chart_definition_id,
      chart_name: chart.chart_name,
      chart_type: chart.chart_type,
      position: {
        x: 0,
        y: nextY,
        w: 6, // Half width
        h: 4  // Standard height
      }
    };

    setSelectedCharts(prev => [...prev, dashboardChart]);
  };

  const removeChartFromDashboard = (chartId: string) => {
    setSelectedCharts(prev => prev.filter(c => c.chart_definition_id !== chartId));
  };

  const updateChartPosition = (chartId: string, newPosition: Partial<DashboardChart['position']>) => {
    setSelectedCharts(prev => 
      prev.map(chart => 
        chart.chart_definition_id === chartId 
          ? { ...chart, position: { ...chart.position, ...newPosition } }
          : chart
      )
    );
  };

  const handleSave = async () => {
    if (!dashboardName.trim()) {
      alert('Dashboard name is required');
      return;
    }

    setIsLoading(true);
    
    try {
      const dashboardData = {
        dashboard_name: dashboardName,
        dashboard_description: dashboardDescription,
        layout_config: {
          grid: {
            cols: 12,
            rowHeight: 100,
            margin: [16, 16]
          },
          charts: selectedCharts.map(chart => ({
            chart_definition_id: chart.chart_definition_id,
            position: chart.position
          }))
        },
        chart_ids: selectedCharts.map(c => c.chart_definition_id),
        chart_positions: selectedCharts.map(c => c.position)
      };

      console.log('💾 Saving dashboard:', dashboardData);

      const response = await fetch('/api/admin/analytics/dashboards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dashboardData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save dashboard');
      }

      const result = await response.json();
      console.log('✅ Dashboard saved successfully:', result);
      
      if (onSave) {
        onSave(result.data.dashboard);
      }
      
    } catch (error) {
      console.error('❌ Failed to save dashboard:', error);
      alert(`Failed to save dashboard: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto bg-white dark:bg-gray-800 shadow-sm rounded-xl">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Dashboard Builder
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Create a multi-chart dashboard with custom layout
        </p>
      </div>

      {/* Dashboard Configuration */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Dashboard Name
            </label>
            <input
              type="text"
              value={dashboardName}
              onChange={(e) => setDashboardName(e.target.value)}
              placeholder="Enter dashboard name"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Description (Optional)
            </label>
            <input
              type="text"
              value={dashboardDescription}
              onChange={(e) => setDashboardDescription(e.target.value)}
              placeholder="Describe this dashboard"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Available Charts Sidebar */}
        <div className="w-1/3 border-r border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
            Available Charts
          </h3>
          
          <div className="space-y-3">
            {availableCharts.map((chart) => (
              <div
                key={chart.chart_definition_id}
                className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                onClick={() => addChartToDashboard(chart)}
              >
                <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                  {chart.chart_name}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {chart.chart_type} chart
                </div>
                {chart.chart_description && (
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {chart.chart_description.substring(0, 60)}...
                  </div>
                )}
              </div>
            ))}
            
            {availableCharts.length === 0 && (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <div className="mb-2">📊 No charts available</div>
                <div className="text-xs">
                  Create some chart definitions first
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Dashboard Layout Area */}
        <div className="flex-1 p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
              Dashboard Layout
            </h3>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {selectedCharts.length} chart{selectedCharts.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Dashboard Grid Preview */}
          <div className="min-h-96 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4">
            {selectedCharts.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                <div className="text-center">
                  <div className="text-4xl mb-2">📊</div>
                  <div>Drag charts here to build your dashboard</div>
                  <div className="text-sm mt-1">Click charts from the sidebar to add them</div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-12 gap-4">
                {selectedCharts.map((chart, index) => (
                  <div
                    key={chart.chart_definition_id}
                    className={`col-span-${chart.position.w} bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-4 relative group`}
                    style={{ minHeight: `${chart.position.h * 100}px` }}
                  >
                    {/* Chart Preview */}
                    <div className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                      {chart.chart_name}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {chart.chart_type} chart
                    </div>
                    
                    {/* Chart Controls */}
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="flex gap-1">
                        {/* Size Controls */}
                        <button
                          onClick={() => updateChartPosition(chart.chart_definition_id, { 
                            w: Math.max(3, chart.position.w - 3) 
                          })}
                          className="w-6 h-6 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                          title="Make smaller"
                        >
                          -
                        </button>
                        <button
                          onClick={() => updateChartPosition(chart.chart_definition_id, { 
                            w: Math.min(12, chart.position.w + 3) 
                          })}
                          className="w-6 h-6 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
                          title="Make larger"
                        >
                          +
                        </button>
                        
                        {/* Remove Chart */}
                        <button
                          onClick={() => removeChartFromDashboard(chart.chart_definition_id)}
                          className="w-6 h-6 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                          title="Remove chart"
                        >
                          ×
                        </button>
                      </div>
                    </div>

                    {/* Position Info */}
                    <div className="absolute bottom-2 left-2 text-xs text-gray-500 dark:text-gray-400">
                      {chart.position.w} cols × {chart.position.h} rows
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-between">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
        >
          Cancel
        </button>
        
        <button
          onClick={handleSave}
          disabled={isLoading || !dashboardName.trim() || selectedCharts.length === 0}
          className="px-6 py-2 bg-violet-500 text-white rounded-md hover:bg-violet-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Saving...' : 'Save Dashboard'}
        </button>
      </div>
    </div>
  );
}
