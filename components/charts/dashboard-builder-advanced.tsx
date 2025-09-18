'use client';

import { useState, useEffect, useCallback } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { ChartDefinition } from '@/lib/types/analytics';
import AnalyticsChart from './analytics-chart';
import Toast from '@/components/toast';
import { DashboardSkeleton } from '@/components/ui/loading-skeleton';

/**
 * Enhanced Dashboard Builder with React-DND
 * Professional drag-and-drop dashboard builder with grid layout
 */

const ItemTypes = {
  CHART: 'chart',
  DASHBOARD_CHART: 'dashboard_chart'
};

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

// Draggable Chart Item from Sidebar
interface DraggableChartProps {
  chart: ChartDefinition;
  onAddChart: (chart: ChartDefinition) => void;
}

function DraggableChart({ chart, onAddChart }: DraggableChartProps) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: ItemTypes.CHART,
    item: { chart },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  return (
    <div
      ref={drag as any}
      className={`p-3 border border-gray-200 dark:border-gray-700 rounded-lg cursor-move transition-all ${
        isDragging
          ? 'opacity-50 scale-95 border-violet-500 shadow-lg'
          : 'hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-violet-300 dark:hover:border-violet-600'
      }`}
    >
      <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">
        {chart.chart_name}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">
        {chart.chart_type} chart
      </div>
      {chart.chart_description && (
        <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
          {chart.chart_description}
        </div>
      )}
      <div className="flex items-center mt-2">
        <div className="w-2 h-2 bg-green-400 rounded-full mr-1"></div>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {chart.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>
    </div>
  );
}

// Dashboard Chart Item (can be moved within dashboard)
interface DashboardChartItemProps {
  dashboardChart: DashboardChart;
  dashboardConfig: DashboardConfig;
  onMove: (id: string, position: Partial<DashboardChart['position']>) => void;
  onRemove: (id: string) => void;
  onResize: (id: string, size: { w: number; h: number }) => void;
}

function DashboardChartItem({ dashboardChart, dashboardConfig, onMove, onRemove, onResize }: DashboardChartItemProps) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: ItemTypes.DASHBOARD_CHART,
    item: { id: dashboardChart.id, position: dashboardChart.position },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  return (
    <div
      className={`relative border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-700 transition-all ${
        isDragging ? 'opacity-50 scale-95 shadow-xl z-10' : 'hover:border-violet-300 dark:hover:border-violet-600'
      }`}
      style={{
        gridColumn: `span ${Math.min(dashboardChart.position.w, dashboardConfig.layout.columns)}`,
        gridRow: `span ${dashboardChart.position.h}`,
        minHeight: `${dashboardChart.position.h * dashboardConfig.layout.rowHeight}px`
      }}
    >
      {/* Drag Handle */}
      <div
        ref={drag as any}
        className="absolute top-2 left-2 right-2 h-6 bg-gray-100 dark:bg-gray-600 rounded cursor-move flex items-center justify-center group"
      >
        <div className="flex space-x-1">
          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
        </div>
        
        {/* Control Buttons */}
        <div className="absolute right-1 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1">
          {/* Resize Buttons */}
          <button
            onClick={() => onRemove(dashboardChart.id)}
            className="w-4 h-4 bg-red-500 text-white text-xs rounded hover:bg-red-600 flex items-center justify-center"
            title="Remove chart"
          >
            ×
          </button>
        </div>
      </div>

      {/* Chart Content */}
      <div className="p-4 pt-10">
        {dashboardChart.chartDefinition ? (
          <div className="h-full">
            <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2 text-sm">
              {dashboardChart.chartDefinition.chart_name}
            </h4>
            <div className="bg-gray-50 dark:bg-gray-800 rounded p-2 text-center text-xs text-gray-500 dark:text-gray-400 mb-3">
              {dashboardChart.chartDefinition.chart_type} Chart Preview
              <br />
              <span className="text-xs">
                Position: ({dashboardChart.position.x}, {dashboardChart.position.y}) | Size: {dashboardChart.position.w} × {dashboardChart.position.h}
              </span>
            </div>

            {/* Chart Size Controls */}
            <div className="mb-3">
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">Width:</div>
              <div className="flex gap-1">
                <button
                  onClick={() => onResize(dashboardChart.id, { w: 6, h: dashboardChart.position.h })}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    dashboardChart.position.w === 6 
                      ? 'bg-violet-500 text-white' 
                      : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                  }`}
                >
                  Half
                </button>
                <button
                  onClick={() => onResize(dashboardChart.id, { w: 8, h: dashboardChart.position.h })}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    dashboardChart.position.w === 8 
                      ? 'bg-violet-500 text-white' 
                      : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                  }`}
                >
                  Large
                </button>
                <button
                  onClick={() => onResize(dashboardChart.id, { w: 12, h: dashboardChart.position.h })}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    dashboardChart.position.w === 12 
                      ? 'bg-violet-500 text-white' 
                      : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                  }`}
                >
                  Full
                </button>
              </div>
            </div>

            {/* Position Controls */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <label className="block text-gray-600 dark:text-gray-400 mb-1">X:</label>
                <input
                  type="number"
                  min="0"
                  max={dashboardConfig.layout.columns - dashboardChart.position.w}
                  value={dashboardChart.position.x}
                  onChange={(e) => onMove(dashboardChart.id, { x: parseInt(e.target.value) || 0 })}
                  className="w-full px-1 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-gray-600 dark:text-gray-400 mb-1">Y:</label>
                <input
                  type="number"
                  min="0"
                  value={dashboardChart.position.y}
                  onChange={(e) => onMove(dashboardChart.id, { y: parseInt(e.target.value) || 0 })}
                  className="w-full px-1 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-gray-600 dark:text-gray-400 mb-1">H:</label>
                <input
                  type="number"
                  min="1"
                  max="6"
                  value={dashboardChart.position.h}
                  onChange={(e) => onResize(dashboardChart.id, { w: dashboardChart.position.w, h: parseInt(e.target.value) || 2 })}
                  className="w-full px-1 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-gray-500 dark:text-gray-400">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500 mx-auto mb-2"></div>
              <p className="text-xs">Loading chart...</p>
            </div>
          </div>
        )}
      </div>

      {/* Resize Handle */}
      <div className="absolute bottom-1 right-1 w-3 h-3 bg-gray-400 hover:bg-gray-600 cursor-se-resize opacity-50 hover:opacity-100 transition-opacity">
        <div className="absolute bottom-0 right-0 w-0 h-0 border-l-3 border-b-3 border-l-transparent border-b-gray-600"></div>
      </div>
    </div>
  );
}

// Drop Zone for Dashboard
interface DropZoneProps {
  onDrop: (item: any, position: { x: number; y: number }) => void;
  children: React.ReactNode;
  dashboardConfig: DashboardConfig;
}

function DropZone({ onDrop, children, dashboardConfig }: DropZoneProps) {
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: [ItemTypes.CHART, ItemTypes.DASHBOARD_CHART],
    drop: (item: any, monitor) => {
      const offset = monitor.getClientOffset();
      const dropTargetRef = monitor.getDropResult();
      
      if (offset) {
        // Get the drop zone element to calculate relative position
        const dropZone = document.querySelector('[data-drop-zone="true"]') as HTMLElement;
        if (dropZone) {
          const rect = dropZone.getBoundingClientRect();
          const relativeX = offset.x - rect.left;
          const relativeY = offset.y - rect.top;
          
          // Calculate grid cell size based on current layout configuration
          const cellWidth = rect.width / dashboardConfig.layout.columns;
          const cellHeight = dashboardConfig.layout.rowHeight;
          
          // Calculate grid position
          const gridX = Math.floor(relativeX / cellWidth);
          const gridY = Math.floor(relativeY / cellHeight);
          
          // Ensure position is within bounds
          const boundedX = Math.max(0, Math.min(gridX, dashboardConfig.layout.columns - 1));
          const boundedY = Math.max(0, gridY);
          
          onDrop(item, { x: boundedX, y: boundedY });
        } else {
          // Fallback to center position
          onDrop(item, { x: 0, y: 0 });
        }
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  }));

  return (
    <div
      ref={drop as any}
      data-drop-zone="true"
      className={`relative transition-all ${
        isOver && canDrop
          ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
          : 'border-gray-300 dark:border-gray-600'
      } border-2 border-dashed rounded-lg p-4 min-h-96`}
    >
      {children}
      
      {/* Grid Overlay and Drop Indicator */}
      {isOver && canDrop && (
        <>
          {/* Grid Overlay */}
          <div 
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(139, 92, 246, 0.3) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(139, 92, 246, 0.3) 1px, transparent 1px)
              `,
              backgroundSize: `${100 / dashboardConfig.layout.columns}% ${dashboardConfig.layout.rowHeight}px`
            }}
          />
          
          {/* Drop Indicator */}
          <div className="absolute inset-0 flex items-center justify-center bg-violet-100 dark:bg-violet-900/30 border-2 border-violet-500 border-dashed rounded-lg">
            <div className="text-center text-violet-700 dark:text-violet-300">
              <div className="text-2xl mb-2">📊</div>
              <p className="font-medium">Drop chart into grid position</p>
              <p className="text-xs mt-1">
                Grid: {dashboardConfig.layout.columns} columns × {dashboardConfig.layout.rowHeight}px rows
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Main Enhanced Dashboard Builder Component
export default function EnhancedDashboardBuilder() {
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
  const [showGridPreview, setShowGridPreview] = useState(false);

  useEffect(() => {
    loadCharts();
  }, []);

  const loadCharts = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/admin/analytics/charts');
      if (response.ok) {
        const result = await response.json();
        setAvailableCharts(result.data.charts || []);
      }
    } catch (error) {
      console.error('Failed to load charts:', error);
      setToastMessage('Failed to load available charts');
      setToastType('error');
      setShowToast(true);
    } finally {
      setIsLoading(false);
    }
  };

  const addChartToDashboard = useCallback((chart: ChartDefinition, position?: { x: number; y: number }) => {
    const newChart: DashboardChart = {
      id: `dashboard-chart-${Date.now()}`,
      chartDefinitionId: chart.chart_definition_id,
      position: {
        x: position?.x || 0,
        y: position?.y || 0,
        w: 6, // Default width
        h: 2  // Default height
      },
      chartDefinition: chart
    };

    setDashboardConfig(prev => ({
      ...prev,
      charts: [...prev.charts, newChart]
    }));
  }, []);

  const moveChart = useCallback((chartId: string, position: Partial<DashboardChart['position']>) => {
    setDashboardConfig(prev => ({
      ...prev,
      charts: prev.charts.map(chart =>
        chart.id === chartId
          ? { ...chart, position: { ...chart.position, ...position } }
          : chart
      )
    }));
  }, []);

  const resizeChart = useCallback((chartId: string, size: { w: number; h: number }) => {
    setDashboardConfig(prev => ({
      ...prev,
      charts: prev.charts.map(chart =>
        chart.id === chartId
          ? { ...chart, position: { ...chart.position, ...size } }
          : chart
      )
    }));
  }, []);

  const removeChart = useCallback((chartId: string) => {
    setDashboardConfig(prev => ({
      ...prev,
      charts: prev.charts.filter(chart => chart.id !== chartId)
    }));
  }, []);

  // Collision detection helper
  const isPositionAvailable = useCallback((x: number, y: number, w: number, h: number, excludeId?: string) => {
    return !dashboardConfig.charts.some(chart => {
      if (excludeId && chart.id === excludeId) return false; // Exclude the chart being moved
      
      // Check if rectangles overlap
      const chart1 = { x, y, w, h };
      const chart2 = chart.position;
      
      return !(chart1.x + chart1.w <= chart2.x || 
               chart2.x + chart2.w <= chart1.x || 
               chart1.y + chart1.h <= chart2.y || 
               chart2.y + chart2.h <= chart1.y);
    });
  }, [dashboardConfig.charts]);

  // Find next available position
  const findAvailablePosition = useCallback((w: number, h: number) => {
    for (let y = 0; y < 20; y++) { // Max 20 rows
      for (let x = 0; x <= dashboardConfig.layout.columns - w; x++) {
        if (isPositionAvailable(x, y, w, h)) {
          return { x, y };
        }
      }
    }
    return { x: 0, y: 0 }; // Fallback
  }, [dashboardConfig.layout.columns, isPositionAvailable]);

  const handleDrop = useCallback((item: any, position: { x: number; y: number }) => {
    if (item.chart) {
      // Adding new chart from sidebar
      const chartWidth = 6; // Default width
      const chartHeight = 2; // Default height
      
      // Check if the dropped position is available
      if (isPositionAvailable(position.x, position.y, chartWidth, chartHeight)) {
        addChartToDashboard(item.chart, position);
      } else {
        // Find alternative position
        const availablePosition = findAvailablePosition(chartWidth, chartHeight);
        addChartToDashboard(item.chart, availablePosition);
      }
    } else if (item.id) {
      // Moving existing chart
      const chart = dashboardConfig.charts.find(c => c.id === item.id);
      if (chart && isPositionAvailable(position.x, position.y, chart.position.w, chart.position.h, item.id)) {
        moveChart(item.id, { x: position.x, y: position.y });
      }
      // If position not available, don't move (stay in original position)
    }
  }, [addChartToDashboard, moveChart, isPositionAvailable, findAvailablePosition, dashboardConfig.charts]);

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

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="max-w-7xl mx-auto bg-white dark:bg-gray-800 shadow-sm rounded-xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Enhanced Dashboard Builder
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Create multi-chart dashboards with professional drag-and-drop interface
          </p>
        </div>

        <div className="flex">
          {/* Chart Library Sidebar */}
          <div className="w-1/3 border-r border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4 flex items-center">
              <span className="mr-2">📊</span>
              Available Charts
              <span className="ml-2 text-xs bg-violet-100 dark:bg-violet-900 text-violet-700 dark:text-violet-300 px-2 py-1 rounded-full">
                {availableCharts.length}
              </span>
            </h3>
            
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {availableCharts.map((chart, index) => (
                <DraggableChart
                  key={chart.chart_definition_id || `chart-${index}`}
                  chart={chart}
                  onAddChart={addChartToDashboard}
                />
              ))}
            </div>

            {/* Quick Actions */}
            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                Quick Actions
              </h4>
              <div className="space-y-2">
                <button
                  onClick={() => setDashboardConfig(prev => ({ ...prev, charts: [] }))}
                  className="w-full text-left px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                >
                  Clear Dashboard
                </button>
                <button
                  onClick={loadCharts}
                  className="w-full text-left px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                >
                  Refresh Charts
                </button>
              </div>
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

              {/* Layout Configuration Controls */}
              <details className="mt-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-t-lg">
                  🎛️ Layout Configuration ({dashboardConfig.layout.columns} cols × {dashboardConfig.layout.rowHeight}px rows)
                </summary>
                
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/20">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">6-24 columns</div>
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
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">100-300px</div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Grid Margin (px)
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
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">0-50px spacing</div>
                    </div>
                  </div>

                  <div className="mt-3 flex justify-between items-center">
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      💡 Layout changes apply immediately to the dashboard canvas
                    </div>
                    
                    <label className="flex items-center text-xs">
                      <input
                        type="checkbox"
                        checked={showGridPreview}
                        onChange={(e) => setShowGridPreview(e.target.checked)}
                        className="mr-1 text-violet-500"
                      />
                      <span className="text-gray-600 dark:text-gray-400">Show Grid</span>
                    </label>
                  </div>
                </div>
              </details>
            </div>

            {/* Dashboard Canvas */}
            <DropZone onDrop={handleDrop} dashboardConfig={dashboardConfig}>
              {/* Grid Preview Overlay */}
              {showGridPreview && (
                <div 
                  className="absolute inset-4 pointer-events-none z-10"
                  style={{
                    backgroundImage: `
                      linear-gradient(to right, rgba(139, 92, 246, 0.2) 1px, transparent 1px),
                      linear-gradient(to bottom, rgba(139, 92, 246, 0.2) 1px, transparent 1px)
                    `,
                    backgroundSize: `${100 / dashboardConfig.layout.columns}% ${dashboardConfig.layout.rowHeight}px`
                  }}
                />
              )}
              
              {dashboardConfig.charts.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                  <div className="text-center">
                    <div className="text-6xl mb-4">📊</div>
                    <p className="text-lg font-medium mb-2">Empty Dashboard Canvas</p>
                    <p className="text-sm">
                      Drag charts from the sidebar to build your dashboard
                    </p>
                    <div className="mt-4 text-xs text-gray-400 dark:text-gray-500">
                      💡 Tip: Charts can be resized and repositioned after adding
                    </div>
                  </div>
                </div>
              ) : (
                <div 
                  className="grid auto-rows-min"
                  style={{
                    gridTemplateColumns: `repeat(${dashboardConfig.layout.columns}, 1fr)`,
                    gap: `${dashboardConfig.layout.margin}px`,
                    gridAutoRows: `${dashboardConfig.layout.rowHeight}px`
                  }}
                >
                  {dashboardConfig.charts.map((dashboardChart, index) => (
                    <DashboardChartItem
                      key={dashboardChart.id || `dashboard-chart-${index}`}
                      dashboardChart={dashboardChart}
                      dashboardConfig={dashboardConfig}
                      onMove={moveChart}
                      onRemove={removeChart}
                      onResize={resizeChart}
                    />
                  ))}
                </div>
              )}
            </DropZone>

            {/* Save Button */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={saveDashboard}
                disabled={isSaving || !dashboardConfig.dashboardName.trim() || dashboardConfig.charts.length === 0}
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
                    Save Dashboard
                  </>
                )}
              </button>
            </div>
          </div>
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
    </DndProvider>
  );
}
