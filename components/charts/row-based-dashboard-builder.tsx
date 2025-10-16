'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ChartDefinition } from '@/lib/types/analytics';
import DashboardRowBuilder, { RowBasedDashboardConfig, DashboardRow, DashboardChartSlot } from './dashboard-row-builder';
import DashboardPreviewModal from '@/components/dashboard-preview-modal';
import Toast from '@/components/toast';
import { apiClient } from '@/lib/api/client';
import type { DashboardFilterConfig } from './dashboard-filter-bar';

interface DashboardChartAssoc {
  dashboard_chart_id: string;
  chart_definition_id: string;
  position_config?: {
    x?: number;
    y?: number;
    w?: number;
    h?: number;
  };
}

interface EditingDashboard {
  dashboard_id?: string | undefined;
  dashboard_name?: string | undefined;
  dashboard_description?: string | undefined;
  is_published?: boolean | undefined;
  charts?: DashboardChartAssoc[] | undefined;
  layout_config?: Record<string, unknown> | undefined;
}

interface RowBasedDashboardBuilderProps {
  editingDashboard?: EditingDashboard;
  onCancel?: () => void;
  onSaveSuccess?: () => void;
}

export default function RowBasedDashboardBuilder({
  editingDashboard,
  onCancel,
  onSaveSuccess
}: RowBasedDashboardBuilderProps = {}) {
  const [dashboardConfig, setDashboardConfig] = useState<RowBasedDashboardConfig>({
    dashboardName: '',
    dashboardDescription: '',
    rows: []
  });

  // Phase 7: Dashboard filter configuration state
  const [filterConfig, setFilterConfig] = useState<DashboardFilterConfig>({
    enabled: true,
    showDateRange: true,
    showOrganization: true,
    showPractice: false,
    showProvider: false,
    defaultFilters: {
      dateRangePreset: 'last_30_days',
    },
  });

  const [availableCharts, setAvailableCharts] = useState<ChartDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(!!editingDashboard);

  useEffect(() => {
    loadCharts();
  }, []);

  // Populate form when editing a dashboard
  useEffect(() => {
    if (editingDashboard && availableCharts.length > 0) {
      console.log('📝 Converting grid-based dashboard to row-based:', editingDashboard);
      
      // Convert grid-based charts to row-based layout
      let rows: DashboardRow[] = [];
      if (editingDashboard.charts && Array.isArray(editingDashboard.charts)) {
        const rowsMap = new Map<number, DashboardChartSlot[]>();
        
        editingDashboard.charts.forEach((chartAssoc, index: number) => {
          const y = chartAssoc.position_config?.y || 0;
          const chartDefinition = availableCharts.find(chart => 
            chart.chart_definition_id === chartAssoc.chart_definition_id
          );

          if (chartDefinition) {
            const chartSlot: DashboardChartSlot = {
              id: `chart-${y}-${chartAssoc.dashboard_chart_id}-${index}`, // Use dashboard_chart_id for uniqueness
              chartDefinitionId: chartAssoc.chart_definition_id,
              chartDefinition,
              widthPercentage: Math.round((chartAssoc.position_config?.w || 6) / 12 * 100) // Convert 12-col grid to percentage
            };

            if (!rowsMap.has(y)) {
              rowsMap.set(y, []);
            }
            rowsMap.get(y)!.push(chartSlot);
          }
        });

        // Convert map to rows array
        rows = Array.from(rowsMap.entries())
          .sort(([a], [b]) => a - b) // Sort by Y position
          .map(([y, charts], index) => ({
            id: `row-${y}-${index}`,
            heightPx: (typeof editingDashboard.layout_config?.rowHeight === 'number' ? editingDashboard.layout_config.rowHeight : 150) * Math.max(1, Math.max(...charts.map((c) => editingDashboard.charts?.find((ec) => ec.chart_definition_id === c.chartDefinitionId)?.position_config?.h || 2))),
            charts
          }));
        console.log('🔄 Converted to row-based layout:', { originalCharts: editingDashboard.charts.length, rows: rows.length });
      }

      // Set all dashboard info in a single state update to avoid race conditions
      setDashboardConfig({
        dashboardName: editingDashboard.dashboard_name || '',
        dashboardDescription: editingDashboard.dashboard_description || '',
        rows
      });

      // Phase 7: Load filter config if exists
      const layoutFilterConfig = editingDashboard.layout_config?.filterConfig as DashboardFilterConfig | undefined;
      if (layoutFilterConfig) {
        setFilterConfig({
          enabled: layoutFilterConfig.enabled !== false,
          showDateRange: layoutFilterConfig.showDateRange !== false,
          showOrganization: layoutFilterConfig.showOrganization !== false,
          showPractice: layoutFilterConfig.showPractice === true,
          showProvider: layoutFilterConfig.showProvider === true,
          defaultFilters: layoutFilterConfig.defaultFilters || {
            dateRangePreset: 'last_30_days',
          },
        });
      }

      setIsEditMode(true);
    }
  }, [editingDashboard, availableCharts]);

  const loadCharts = async () => {
    try {
      setIsLoading(true);
      const result = await apiClient.get<{
        charts: ChartDefinition[];
      }>('/api/admin/analytics/charts?is_active=true');
      const charts = (result.charts || []).map((item: ChartDefinition | { chart_definitions: ChartDefinition }) => {
        return 'chart_definitions' in item ? item.chart_definitions : item;
      }).filter((chart: ChartDefinition) => chart.is_active !== false);
        
      setAvailableCharts(charts);
    } catch (error) {
      console.error('Failed to load charts:', error);
      setToastMessage('Failed to load available charts');
      setToastType('error');
      setShowToast(true);
    } finally {
      setIsLoading(false);
    }
  };

  const addRow = () => {
    const newRow: DashboardRow = {
      id: `row-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Ensure unique ID
      heightPx: 300,
      charts: []
    };
    
    setDashboardConfig(prev => ({
      ...prev,
      rows: [...prev.rows, newRow]
    }));
  };

  const updateRow = useCallback((rowId: string, updates: Partial<DashboardRow>) => {
    setDashboardConfig(prev => ({
      ...prev,
      rows: prev.rows.map(row =>
        row.id === rowId ? { ...row, ...updates } : row
      )
    }));
  }, []);

  const deleteRow = (rowId: string) => {
    setDashboardConfig(prev => ({
      ...prev,
      rows: prev.rows.filter(row => row.id !== rowId)
    }));
  };

  const moveRowUp = (rowId: string) => {
    setDashboardConfig(prev => {
      const rowIndex = prev.rows.findIndex(row => row.id === rowId);
      if (rowIndex > 0 && rowIndex < prev.rows.length) {
        const newRows = [...prev.rows];
        const temp = newRows[rowIndex - 1]!;
        newRows[rowIndex - 1] = newRows[rowIndex]!;
        newRows[rowIndex] = temp;
        return { ...prev, rows: newRows };
      }
      return prev;
    });
  };

  const moveRowDown = (rowId: string) => {
    setDashboardConfig(prev => {
      const rowIndex = prev.rows.findIndex(row => row.id === rowId);
      if (rowIndex >= 0 && rowIndex < prev.rows.length - 1) {
        const newRows = [...prev.rows];
        const temp = newRows[rowIndex]!;
        newRows[rowIndex] = newRows[rowIndex + 1]!;
        newRows[rowIndex + 1] = temp;
        return { ...prev, rows: newRows };
      }
      return prev;
    });
  };

  const saveDashboard = async () => {
    if (!dashboardConfig.dashboardName.trim()) {
      setToastMessage('Dashboard name is required');
      setToastType('error');
      setShowToast(true);
      return;
    }

    if (dashboardConfig.rows.length === 0) {
      setToastMessage('Dashboard must have at least one row');
      setToastType('error');
      setShowToast(true);
      return;
    }

    setIsSaving(true);

    try {
      // Convert row-based config to API format
      const dashboardDefinition: {
        dashboard_name: string;
        dashboard_description: string;
        layout_config: {
          type: string;
          rows: Array<{
            heightPx: number;
            charts: Array<{
              chartDefinitionId: string | undefined;
              widthPercentage: number;
            }>;
          }>;
          filterConfig: DashboardFilterConfig;
        };
        chart_ids?: string[];
        chart_positions?: Array<{
          x: number;
          y: number;
          w: number;
          h: number;
        }>;
        dashboard_id?: string;
        is_published?: boolean | undefined;
      } = {
        dashboard_name: dashboardConfig.dashboardName,
        dashboard_description: dashboardConfig.dashboardDescription,
        layout_config: {
          type: 'row-based',
          rows: dashboardConfig.rows.map(row => ({
            heightPx: row.heightPx,
            charts: row.charts.map(chart => ({
              chartDefinitionId: chart.chartDefinitionId,
              widthPercentage: chart.widthPercentage
            }))
          })),
          // Phase 7: Include filter configuration
          filterConfig,
        },
        // Legacy format for compatibility (convert to grid positions)
        chart_ids: dashboardConfig.rows.flatMap(row => 
          row.charts.filter(chart => chart.chartDefinitionId).map(chart => chart.chartDefinitionId!)
        ),
        chart_positions: dashboardConfig.rows.flatMap((row, rowIndex) => 
          row.charts.filter(chart => chart.chartDefinitionId).map((chart, chartIndex) => ({
            x: chartIndex * 2, // Approximate grid position
            y: rowIndex,
            w: Math.round(chart.widthPercentage / 100 * 12), // Convert percentage to 12-col grid
            h: Math.round(row.heightPx / 150) // Convert height to grid rows
          }))
        )
      };

      // When editing, preserve the existing is_published status
      if (isEditMode && editingDashboard) {
        dashboardDefinition.is_published = editingDashboard.is_published;
      }

      console.log(`💾 ${isEditMode ? 'Updating' : 'Creating'} row-based dashboard:`, dashboardDefinition);

      const url = isEditMode
        ? `/api/admin/analytics/dashboards/${editingDashboard?.dashboard_id}`
        : '/api/admin/analytics/dashboards';
      
      const method = isEditMode ? 'PATCH' : 'POST';

      const response = await apiClient.request(url, {
        method,
        body: JSON.stringify(dashboardDefinition)
      });

      // apiClient.request returns the parsed response directly, so no need to check response.ok
      // If there's an error, it will throw automatically

      setToastMessage(`Dashboard "${dashboardConfig.dashboardName}" ${isEditMode ? 'updated' : 'saved'} successfully!`);
      setToastType('success');
      setShowToast(true);

      // Only redirect after creating new dashboards, stay on editor when editing
      if (onSaveSuccess && !isEditMode) {
        onSaveSuccess();
      } else if (!isEditMode) {
        // Reset form only for new dashboard creation
        setDashboardConfig({
          dashboardName: '',
          dashboardDescription: '',
          rows: []
        });
      }
      // For edit mode, do nothing - stay on the editor page

    } catch (error) {
      setToastMessage(`Failed to ${isEditMode ? 'update' : 'save'} dashboard: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setToastType('error');
      setShowToast(true);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
        <span className="ml-3 text-gray-600 dark:text-gray-400">Loading charts...</span>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto bg-white dark:bg-gray-800 shadow-sm rounded-xl">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {isEditMode ? 'Edit Dashboard' : 'Row-Based Dashboard Builder'}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              {isEditMode 
                ? `Editing: ${dashboardConfig.dashboardName || 'Unnamed Dashboard'}`
                : 'Create dashboards with flexible row-based layouts'
              }
            </p>
          </div>
          
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              ← Back to Dashboards
            </button>
          )}
        </div>
      </div>

      <div className="p-6">
        {/* Dashboard Settings */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
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

        {/* Phase 7: Dashboard Filter Configuration */}
        <div className="mb-6 border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900/30">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-md font-semibold text-gray-900 dark:text-gray-100">
                Dashboard Filters
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Configure dashboard-wide filters that apply to all charts
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filterConfig.enabled}
                onChange={(e) => setFilterConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                className="w-4 h-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Enable Filter Bar
              </span>
            </label>
          </div>

          {filterConfig.enabled && (
            <div className="space-y-4 pl-4 border-l-2 border-violet-200 dark:border-violet-800">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Visible Filters:
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterConfig.showDateRange}
                    onChange={(e) => setFilterConfig(prev => ({ ...prev, showDateRange: e.target.checked }))}
                    className="w-4 h-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Date Range</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterConfig.showOrganization}
                    onChange={(e) => setFilterConfig(prev => ({ ...prev, showOrganization: e.target.checked }))}
                    className="w-4 h-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Organization</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterConfig.showPractice}
                    onChange={(e) => setFilterConfig(prev => ({ ...prev, showPractice: e.target.checked }))}
                    className="w-4 h-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Practice</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterConfig.showProvider}
                    onChange={(e) => setFilterConfig(prev => ({ ...prev, showProvider: e.target.checked }))}
                    className="w-4 h-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Provider</span>
                </label>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Default Filter Values:
                </div>
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                      Default Date Range Preset
                    </label>
                    <select
                      value={filterConfig.defaultFilters?.dateRangePreset || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        setFilterConfig(prev => {
                          const newDefaultFilters = { ...prev.defaultFilters };
                          if (value) {
                            newDefaultFilters.dateRangePreset = value;
                          } else {
                            delete newDefaultFilters.dateRangePreset;
                          }
                          return {
                            ...prev,
                            defaultFilters: newDefaultFilters
                          };
                        });
                      }}
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="">No Default (Use Chart Defaults)</option>
                      <option value="today">Today</option>
                      <option value="yesterday">Yesterday</option>
                      <option value="last_7_days">Last 7 Days</option>
                      <option value="last_14_days">Last 14 Days</option>
                      <option value="last_30_days">Last 30 Days</option>
                      <option value="last_90_days">Last 90 Days</option>
                      <option value="last_180_days">Last 180 Days</option>
                      <option value="last_365_days">Last 365 Days</option>
                      <option value="this_month">This Month</option>
                      <option value="last_month">Last Month</option>
                      <option value="last_3_full_months">Trailing 3 Months</option>
                      <option value="last_6_full_months">Trailing 6 Months</option>
                      <option value="last_12_full_months">Trailing 12 Months</option>
                      <option value="this_quarter">This Quarter</option>
                      <option value="last_quarter">Last Quarter</option>
                      <option value="ytd">Year to Date</option>
                      <option value="this_year">This Year</option>
                      <option value="last_year">Last Year</option>
                    </select>
                  </div>
                </div>

                <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                  💡 Default values are applied when the dashboard loads. Users can override with URL parameters.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Dashboard Rows */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
              Dashboard Layout ({dashboardConfig.rows.length} row{dashboardConfig.rows.length !== 1 ? 's' : ''})
            </h3>
            
            <button
              type="button"
              onClick={addRow}
              className="px-4 py-2 bg-violet-500 text-white rounded-md hover:bg-violet-600 transition-colors flex items-center"
            >
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Row
            </button>
          </div>

          {/* Rows List */}
          {dashboardConfig.rows.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
              <div className="text-6xl mb-4">📊</div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Empty Dashboard</h3>
              <p className="text-gray-600 dark:text-gray-400 mt-2 mb-4">
                Start building your dashboard by adding rows
              </p>
              <button
                type="button"
                onClick={addRow}
                className="px-4 py-2 bg-violet-500 text-white rounded-md hover:bg-violet-600 transition-colors"
              >
                Add Your First Row
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {dashboardConfig.rows.map((row, index) => (
                <DashboardRowBuilder
                  key={row.id}
                  row={row}
                  availableCharts={availableCharts}
                  onUpdateRow={updateRow}
                  onDeleteRow={deleteRow}
                  onMoveRowUp={moveRowUp}
                  onMoveRowDown={moveRowDown}
                  canMoveUp={index > 0}
                  canMoveDown={index < dashboardConfig.rows.length - 1}
                />
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between">
          <button
            type="button"
            onClick={() => setPreviewModalOpen(true)}
            disabled={!dashboardConfig.dashboardName.trim() || dashboardConfig.rows.length === 0}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            <span className="mr-2">👁️</span>
            Preview Dashboard
          </button>
          
          <button
            type="button"
            onClick={saveDashboard}
            disabled={isSaving || !dashboardConfig.dashboardName.trim() || dashboardConfig.rows.length === 0}
            className="px-6 py-2 bg-violet-500 text-white rounded-md hover:bg-violet-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving Dashboard...
              </>
            ) : (
              <>
                <span className="mr-2">💾</span>
                {isEditMode ? 'Update Dashboard' : 'Save Dashboard'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Dashboard Preview Modal */}
      <DashboardPreviewModal
        isOpen={previewModalOpen}
        setIsOpen={setPreviewModalOpen}
        filterConfig={filterConfig}
        dashboardConfig={{
          dashboardName: dashboardConfig.dashboardName,
          dashboardDescription: dashboardConfig.dashboardDescription,
          charts: dashboardConfig.rows.flatMap((row, rowIndex) => 
            row.charts.filter(chart => chart.chartDefinition && chart.chartDefinitionId).map((chart, chartIndex) => ({
              id: `preview-${row.id}-${chart.id}`, // Ensure unique IDs for preview
              chartDefinitionId: chart.chartDefinitionId!,
              position: { 
                x: chartIndex * 2, 
                y: rowIndex, 
                w: Math.round(chart.widthPercentage / 100 * 12), 
                h: Math.round(row.heightPx / 150) 
              },
              chartDefinition: chart.chartDefinition!
            }))
          ),
          layout: { columns: 12, rowHeight: 150, margin: 10 }
        }}
        title={`Preview: ${dashboardConfig.dashboardName || 'Unnamed Dashboard'}`}
      />

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
