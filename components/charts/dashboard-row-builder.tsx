'use client';

import { useState } from 'react';
import type { ChartDefinition, MeasureType, FrequencyType } from '@/lib/types/analytics';
import AnalyticsChart from './analytics-chart';

// New row-based data structures
export interface DashboardChartSlot {
  id: string;
  chartDefinitionId?: string | undefined;
  chartDefinition?: ChartDefinition | undefined;
  widthPercentage: number; // 10-100%
}

export interface DashboardRow {
  id: string;
  heightPx: number; // 150-600px
  charts: DashboardChartSlot[];
}

export interface RowBasedDashboardConfig {
  dashboardName: string;
  dashboardDescription: string;
  rows: DashboardRow[];
}

interface DashboardRowBuilderProps {
  row: DashboardRow;
  availableCharts: ChartDefinition[];
  onUpdateRow: (rowId: string, updates: Partial<DashboardRow>) => void;
  onDeleteRow: (rowId: string) => void;
  onMoveRowUp: (rowId: string) => void;
  onMoveRowDown: (rowId: string) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export default function DashboardRowBuilder({
  row,
  availableCharts,
  onUpdateRow,
  onDeleteRow,
  onMoveRowUp,
  onMoveRowDown,
  canMoveUp,
  canMoveDown
}: DashboardRowBuilderProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const updateRowHeight = (height: number) => {
    onUpdateRow(row.id, { heightPx: height });
  };

  const addChartToRow = () => {
    const newChart: DashboardChartSlot = {
      id: `chart-${row.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Ensure unique ID
      widthPercentage: Math.floor(100 / (row.charts.length + 1)) // Auto-distribute width
    };

    // Rebalance existing charts to make room
    const rebalancedCharts = row.charts.map(chart => ({
      ...chart,
      widthPercentage: Math.floor(100 / (row.charts.length + 1))
    }));

    onUpdateRow(row.id, { 
      charts: [...rebalancedCharts, newChart]
    });
  };

  const removeChartFromRow = (chartId: string) => {
    const remainingCharts = row.charts.filter(chart => chart.id !== chartId);
    
    // Redistribute width among remaining charts
    if (remainingCharts.length > 0) {
      const widthPerChart = Math.floor(100 / remainingCharts.length);
      const rebalancedCharts = remainingCharts.map(chart => ({
        ...chart,
        widthPercentage: widthPerChart
      }));
      
      onUpdateRow(row.id, { charts: rebalancedCharts });
    } else {
      onUpdateRow(row.id, { charts: [] });
    }
  };

  const updateChartWidth = (chartId: string, widthPercentage: number) => {
    const updatedCharts = row.charts.map(chart =>
      chart.id === chartId ? { ...chart, widthPercentage } : chart
    );
    onUpdateRow(row.id, { charts: updatedCharts });
  };

  const updateChartDefinition = (chartId: string, chartDefinitionId: string) => {
    const chartDefinition = availableCharts.find(chart => chart.chart_definition_id === chartDefinitionId);
    const updatedCharts: DashboardChartSlot[] = row.charts.map(chart =>
      chart.id === chartId 
        ? { 
            ...chart, 
            chartDefinitionId, 
            chartDefinition: chartDefinition as ChartDefinition | undefined 
          }
        : chart
    );
    onUpdateRow(row.id, { charts: updatedCharts });
  };

  const autoBalanceWidths = () => {
    if (row.charts.length === 0) return;
    
    const widthPerChart = Math.floor(100 / row.charts.length);
    const balancedCharts = row.charts.map(chart => ({
      ...chart,
      widthPercentage: widthPerChart
    }));
    
    onUpdateRow(row.id, { charts: balancedCharts });
  };

  const totalWidth = row.charts.reduce((sum, chart) => sum + chart.widthPercentage, 0);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 mb-4">
      {/* Row Header Controls */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              <svg 
                className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            
            <h3 className="font-medium text-gray-900 dark:text-gray-100">
              Row {row.charts.length} chart{row.charts.length !== 1 ? 's' : ''}
            </h3>
            
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Height: {row.heightPx}px
            </div>
            
            {totalWidth !== 100 && (
              <div className={`text-xs px-2 py-1 rounded ${
                totalWidth > 100 
                  ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                  : 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300'
              }`}>
                Width: {totalWidth}%
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Row Height Slider */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-600 dark:text-gray-400">Height:</label>
              <input
                type="range"
                min="150"
                max="600"
                step="50"
                value={row.heightPx}
                onChange={(e) => updateRowHeight(parseInt(e.target.value))}
                className="w-20"
              />
              <span className="text-xs text-gray-600 dark:text-gray-400 w-8">{row.heightPx}px</span>
            </div>

            {/* Row Actions */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onMoveRowUp(row.id)}
                disabled={!canMoveUp}
                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Move row up"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
              
              <button
                type="button"
                onClick={() => onMoveRowDown(row.id)}
                disabled={!canMoveDown}
                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Move row down"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              <button
                type="button"
                onClick={addChartToRow}
                className="p-1 text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                title="Add chart to row"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              
              <button
                type="button"
                onClick={autoBalanceWidths}
                disabled={row.charts.length === 0}
                className="p-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Auto-balance chart widths"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
              
              <button
                type="button"
                onClick={() => onDeleteRow(row.id)}
                className="p-1 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                title="Delete row"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Row Content */}
      {isExpanded && (
        <div className="p-4">
          {row.charts.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
              <div className="text-4xl mb-2">📊</div>
              <p>Empty Row</p>
              <p className="text-sm">Click the + button above to add charts</p>
            </div>
          ) : (
            <div 
              className="flex gap-2 overflow-hidden"
              style={{ 
                height: `${row.heightPx}px`,
                maxHeight: `${row.heightPx}px`
              }}
            >
              {row.charts.map((chart) => (
                <div
                  key={chart.id}
                  className="flex flex-col border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-700 overflow-hidden"
                  style={{ 
                    width: `${chart.widthPercentage}%`,
                    maxWidth: `${chart.widthPercentage}%`,
                    minWidth: '200px', // Ensure minimum usable width
                    height: `${row.heightPx}px`,
                    maxHeight: `${row.heightPx}px`
                  }}
                >
                  {/* Chart Controls */}
                  <div className="px-2 py-1 border-b border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-800">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <label className="text-gray-600 dark:text-gray-400">Width:</label>
                        <input
                          type="range"
                          min="10"
                          max="100"
                          step="5"
                          value={chart.widthPercentage}
                          onChange={(e) => updateChartWidth(chart.id, parseInt(e.target.value))}
                          className="w-16"
                        />
                        <span className="text-gray-600 dark:text-gray-400 w-8">{chart.widthPercentage}%</span>
                      </div>
                      
                      <button
                        type="button"
                        onClick={() => removeChartFromRow(chart.id)}
                        className="text-red-500 hover:text-red-600 p-1"
                        title="Remove chart"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    
                    {/* Chart Selector */}
                    <div className="mt-1">
                      <select
                        value={chart.chartDefinitionId || ''}
                        onChange={(e) => updateChartDefinition(chart.id, e.target.value)}
                        className="w-full text-xs px-1 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      >
                        <option value="">Select a chart...</option>
                        {availableCharts.map((chartDef) => (
                          <option key={chartDef.chart_definition_id} value={chartDef.chart_definition_id}>
                            {chartDef.chart_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Chart Content */}
                  <div 
                    className="overflow-hidden p-1"
                    style={{ 
                      height: `${row.heightPx - 60}px`, // Exact height minus controls
                      maxHeight: `${row.heightPx - 60}px`
                    }}
                  >
                    {chart.chartDefinition ? (
                      <div className="w-full h-full overflow-hidden relative">
                        {(() => {
                          // Extract chart configuration
                          const dataSource = chart.chartDefinition.data_source || {};
                          const chartConfig = chart.chartDefinition.chart_config || {};
                          
                          // Extract filters to get chart parameters
                          const measureFilter = dataSource.filters?.find((f: any) => f.field === 'measure');
                          const frequencyFilter = dataSource.filters?.find((f: any) => f.field === 'frequency');
                          const practiceFilter = dataSource.filters?.find((f: any) => f.field === 'practice_uid');
                          const startDateFilter = dataSource.filters?.find((f: any) => f.field === 'date_index' && f.operator === 'gte');
                          const endDateFilter = dataSource.filters?.find((f: any) => f.field === 'date_index' && f.operator === 'lte');

                          // Use responsive sizing based on container - respect configured dimensions
                          const controlsHeight = 60; // Height of chart controls section  
                          const availableHeight = row.heightPx - controlsHeight; // Remaining height for chart
                          const minHeight = Math.max(150, Math.min(availableHeight * 0.6, 200));
                          const maxHeight = availableHeight; // Respect dashboard configuration

                          return (
                            <div 
                              className="w-full flex flex-col"
                              style={{ 
                                height: `${availableHeight}px`,
                                maxHeight: `${availableHeight}px`,
                                overflow: 'hidden'
                              }}
                            >
                              <AnalyticsChart
                                chartType={chart.chartDefinition.chart_type as any}
                                {...(measureFilter?.value && { measure: measureFilter.value as MeasureType })}
                                {...(frequencyFilter?.value && { frequency: frequencyFilter.value as FrequencyType })}
                                practice={practiceFilter?.value?.toString()}
                                startDate={startDateFilter?.value?.toString()}
                                endDate={endDateFilter?.value?.toString()}
                                groupBy={chartConfig.series?.groupBy || 'provider_name'}
                                title={chart.chartDefinition.chart_name}
                                calculatedField={(chartConfig as any).calculatedField}
                                advancedFilters={(dataSource as any).advancedFilters || []}
                                stackingMode={(chartConfig as any).stackingMode}
                                colorPalette={(chartConfig as any).colorPalette}
                                {...((chartConfig as any).seriesConfigs && (chartConfig as any).seriesConfigs.length > 0 ? { multipleSeries: (chartConfig as any).seriesConfigs } : {})}
                                className="w-full h-full flex-1"
                                responsive={true}
                                minHeight={minHeight}
                                maxHeight={maxHeight}
                              />
                            </div>
                          );
                        })()}
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded overflow-hidden">
                        <div className="text-center">
                          <div className="text-2xl mb-1">📊</div>
                          <p className="text-xs">No Chart Selected</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
