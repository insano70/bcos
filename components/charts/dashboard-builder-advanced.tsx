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
        {chart.chart_name || 'Unnamed Chart'}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">
        {chart.chart_type} chart
      </div>
      {chart.chart_description && (
        <div className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
          {chart.chart_description}
        </div>
      )}
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
              <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
                Width: {dashboardChart.position.w} cols ({((dashboardChart.position.w / dashboardConfig.layout.columns) * 100).toFixed(1)}%)
              </div>
              
              {/* Quick Size Buttons */}
              <div className="flex gap-1 mb-2">
                <button
                  onClick={() => onResize(dashboardChart.id, { w: 3, h: dashboardChart.position.h })}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    dashboardChart.position.w === 3 
                      ? 'bg-violet-500 text-white' 
                      : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                  }`}
                >
                  25%
                </button>
                <button
                  onClick={() => onResize(dashboardChart.id, { w: 6, h: dashboardChart.position.h })}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    dashboardChart.position.w === 6 
                      ? 'bg-violet-500 text-white' 
                      : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                  }`}
                >
                  50%
                </button>
                <button
                  onClick={() => onResize(dashboardChart.id, { w: 9, h: dashboardChart.position.h })}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    dashboardChart.position.w === 9 
                      ? 'bg-violet-500 text-white' 
                      : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                  }`}
                >
                  75%
                </button>
                <button
                  onClick={() => onResize(dashboardChart.id, { w: 12, h: dashboardChart.position.h })}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    dashboardChart.position.w === 12 
                      ? 'bg-violet-500 text-white' 
                      : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                  }`}
                >
                  100%
                </button>
              </div>
              
              {/* Granular Width Control */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onResize(dashboardChart.id, { 
                    w: Math.max(1, dashboardChart.position.w - 1), 
                    h: dashboardChart.position.h 
                  })}
                  disabled={dashboardChart.position.w <= 1}
                  className="w-6 h-6 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  title="Decrease width"
                >
                  −
                </button>
                
                <input
                  type="number"
                  min="1"
                  max={dashboardConfig.layout.columns}
                  value={dashboardChart.position.w}
                  onChange={(e) => {
                    const newWidth = parseInt(e.target.value) || 1;
                    const maxWidth = dashboardConfig.layout.columns - dashboardChart.position.x;
                    onResize(dashboardChart.id, { 
                      w: Math.min(newWidth, maxWidth), 
                      h: dashboardChart.position.h 
                    });
                  }}
                  className="w-12 px-1 py-1 text-xs text-center border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
                
                <button
                  onClick={() => onResize(dashboardChart.id, { 
                    w: Math.min(dashboardConfig.layout.columns - dashboardChart.position.x, dashboardChart.position.w + 1), 
                    h: dashboardChart.position.h 
                  })}
                  disabled={dashboardChart.position.w >= dashboardConfig.layout.columns - dashboardChart.position.x}
                  className="w-6 h-6 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  title="Increase width"
                >
                  +
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

// Individual Grid Cell Drop Zone
interface GridCellProps {
  x: number;
  y: number;
  isOccupied: boolean;
  availableWidth: number;
  onDrop: (item: any, position: { x: number; y: number }) => void;
  dashboardConfig: DashboardConfig;
}

function GridCell({ x, y, isOccupied, availableWidth, onDrop, dashboardConfig }: GridCellProps) {
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: [ItemTypes.CHART, ItemTypes.DASHBOARD_CHART],
    drop: (item: any) => {
      onDrop(item, { x, y });
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop() && !isOccupied,
    }),
  }));

  const widthPercentage = ((availableWidth / dashboardConfig.layout.columns) * 100).toFixed(0);

  return (
    <div
      ref={drop as any}
      className={`
        border border-dashed transition-all min-h-[60px] flex flex-col items-center justify-center text-center
        ${isOccupied 
          ? 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700' 
          : isOver && canDrop
          ? 'border-violet-500 bg-violet-100 dark:bg-violet-900/30 border-2'
          : canDrop
          ? 'border-violet-300 dark:border-violet-600 bg-violet-50 dark:bg-violet-900/10 hover:border-violet-400'
          : 'border-gray-200 dark:border-gray-700'
        }
      `}
      title={isOccupied ? 'Occupied' : `Drop zone (${x}, ${y}) - ${availableWidth} cols available (${widthPercentage}%)`}
    >
      {isOccupied ? (
        <span className="text-xs text-gray-400">Occupied</span>
      ) : isOver && canDrop ? (
        <>
          <span className="text-xs text-violet-600 dark:text-violet-400 font-medium">Drop Here</span>
          <span className="text-xs text-violet-500 dark:text-violet-400">
            {availableWidth} cols ({widthPercentage}%)
          </span>
        </>
      ) : canDrop && availableWidth > 0 ? (
        <>
          <span className="text-xs text-gray-400">({x}, {y})</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {availableWidth} cols
          </span>
        </>
      ) : null}
    </div>
  );
}

// Enhanced Drop Zone with Grid Cells
interface DropZoneProps {
  onDrop: (item: any, position: { x: number; y: number }) => void;
  children: React.ReactNode;
  dashboardConfig: DashboardConfig;
}

function DropZone({ onDrop, children, dashboardConfig }: DropZoneProps) {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: [ItemTypes.CHART, ItemTypes.DASHBOARD_CHART],
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  }));

  // Create a grid occupancy map
  const createOccupancyMap = () => {
    const occupancyMap = new Map<string, boolean>();
    
    dashboardConfig.charts.forEach(chart => {
      for (let y = chart.position.y; y < chart.position.y + chart.position.h; y++) {
        for (let x = chart.position.x; x < chart.position.x + chart.position.w; x++) {
          occupancyMap.set(`${x}-${y}`, true);
        }
      }
    });
    
    return occupancyMap;
  };

  const occupancyMap = createOccupancyMap();
  const maxRows = Math.max(6, Math.max(...dashboardConfig.charts.map(c => c.position.y + c.position.h), 0) + 2);

  return (
    <div
      ref={drop as any}
      data-drop-zone="true"
      className="relative border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 min-h-96"
    >
      {/* Show grid cells when dragging or when dashboard is empty */}
      {(isOver || dashboardConfig.charts.length === 0) && (
        <div 
          className="absolute inset-4 grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${dashboardConfig.layout.columns}, 1fr)`,
            gridTemplateRows: `repeat(${maxRows}, ${dashboardConfig.layout.rowHeight}px)`,
          }}
        >
          {Array.from({ length: maxRows }).map((_, rowIndex) =>
            Array.from({ length: dashboardConfig.layout.columns }).map((_, colIndex) => {
              const isOccupied = occupancyMap.get(`${colIndex}-${rowIndex}`) || false;
              
              // Calculate available width from this position
              let availableWidth = dashboardConfig.layout.columns - colIndex;
              for (const chart of dashboardConfig.charts) {
                if (chart.position.y <= rowIndex && rowIndex < chart.position.y + chart.position.h) {
                  if (chart.position.x > colIndex && chart.position.x < colIndex + availableWidth) {
                    availableWidth = chart.position.x - colIndex;
                  }
                }
              }
              
              return (
                <GridCell
                  key={`${colIndex}-${rowIndex}`}
                  x={colIndex}
                  y={rowIndex}
                  isOccupied={isOccupied}
                  availableWidth={Math.max(0, availableWidth)}
                  onDrop={onDrop}
                  dashboardConfig={dashboardConfig}
                />
              );
            })
          )}
        </div>
      )}
      
      {/* Regular content when not dragging */}
      {!isOver && dashboardConfig.charts.length > 0 && children}
      
      {/* Empty state */}
      {!isOver && dashboardConfig.charts.length === 0 && (
        <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 relative z-10">
          <div className="text-center">
            <div className="text-6xl mb-4">📊</div>
            <p className="text-lg font-medium mb-2">Empty Dashboard Canvas</p>
            <p className="text-sm">
              Drag charts from the sidebar to specific grid cells
            </p>
            <div className="mt-4 text-xs text-gray-400 dark:text-gray-500">
              💡 Each cell represents a precise drop target
            </div>
          </div>
        </div>
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
      const response = await fetch('/api/admin/analytics/charts?is_active=true');
      if (response.ok) {
        const result = await response.json();
        // Filter to only show active charts and extract chart definitions from API response
        const charts = (result.data.charts || []).map((item: any) => {
          // Handle joined API response structure
          return item.chart_definitions || item;
        }).filter((chart: any) => chart.is_active !== false);
        
        setAvailableCharts(charts);
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

  const addChartToDashboard = useCallback((chart: ChartDefinition, position?: { x: number; y: number; w?: number; h?: number }) => {
    const newChart: DashboardChart = {
      id: `dashboard-chart-${Date.now()}`,
      chartDefinitionId: chart.chart_definition_id,
      position: {
        x: position?.x || 0,
        y: position?.y || 0,
        w: position?.w || 6, // Default width or specified width
        h: position?.h || 2  // Default height or specified height
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

  // Find next available position with smart row management
  const findAvailablePosition = useCallback((w: number, h: number) => {
    // Try to find space in existing rows first
    const maxExistingRow = dashboardConfig.charts.length > 0 
      ? Math.max(...dashboardConfig.charts.map(c => c.position.y + c.position.h))
      : 0;
    
    // Search existing rows first
    for (let y = 0; y <= maxExistingRow; y++) {
      for (let x = 0; x <= dashboardConfig.layout.columns - w; x++) {
        if (isPositionAvailable(x, y, w, h)) {
          return { x, y };
        }
      }
    }
    
    // If no space in existing rows, create new row
    const newRowY = maxExistingRow + 1;
    return { x: 0, y: newRowY };
  }, [dashboardConfig.layout.columns, dashboardConfig.charts, isPositionAvailable]);

  // Calculate available width in a row at a specific position
  const calculateAvailableWidth = useCallback((x: number, y: number) => {
    let availableWidth = dashboardConfig.layout.columns - x;
    
    // Check for charts in the same row that would limit width
    for (const chart of dashboardConfig.charts) {
      if (chart.position.y <= y && y < chart.position.y + chart.position.h) {
        if (chart.position.x > x && chart.position.x < x + availableWidth) {
          availableWidth = chart.position.x - x;
        }
      }
    }
    
    return Math.max(1, availableWidth);
  }, [dashboardConfig.charts, dashboardConfig.layout.columns]);

  const handleDrop = useCallback((item: any, position: { x: number; y: number }) => {
    if (item.chart) {
      // Adding new chart from sidebar
      let chartWidth = 6; // Default width
      const chartHeight = 2; // Default height
      
      // Smart auto-fitting: calculate available width at drop position
      const availableWidth = calculateAvailableWidth(position.x, position.y);
      
      // Auto-fit to available space if smaller than default
      if (availableWidth < chartWidth) {
        chartWidth = availableWidth;
      }
      
      // Check if the calculated position is available
      if (isPositionAvailable(position.x, position.y, chartWidth, chartHeight)) {
        addChartToDashboard(item.chart, { ...position, w: chartWidth, h: chartHeight });
      } else {
        // Find alternative position with smart sizing
        const availablePosition = findAvailablePosition(chartWidth, chartHeight);
        const smartWidth = calculateAvailableWidth(availablePosition.x, availablePosition.y);
        addChartToDashboard(item.chart, { ...availablePosition, w: Math.min(chartWidth, smartWidth), h: chartHeight });
      }
    } else if (item.id) {
      // Moving existing chart
      const chart = dashboardConfig.charts.find(c => c.id === item.id);
      if (chart) {
        // Check if position is available for the current chart size
        if (isPositionAvailable(position.x, position.y, chart.position.w, chart.position.h, item.id)) {
          moveChart(item.id, { x: position.x, y: position.y });
        } else {
          // Try to fit with smaller width if needed
          const availableWidth = calculateAvailableWidth(position.x, position.y);
          if (availableWidth >= 1 && isPositionAvailable(position.x, position.y, availableWidth, chart.position.h, item.id)) {
            moveChart(item.id, { x: position.x, y: position.y });
            resizeChart(item.id, { w: availableWidth, h: chart.position.h });
          }
          // If still not available, don't move (stay in original position)
        }
      }
    }
  }, [addChartToDashboard, moveChart, resizeChart, isPositionAvailable, findAvailablePosition, calculateAvailableWidth, dashboardConfig.charts]);

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
                    
                    <div className="flex items-center gap-3">
                      <label className="flex items-center text-xs">
                        <input
                          type="checkbox"
                          checked={showGridPreview}
                          onChange={(e) => setShowGridPreview(e.target.checked)}
                          className="mr-1 text-violet-500"
                        />
                        <span className="text-gray-600 dark:text-gray-400">Show Grid</span>
                      </label>
                      
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Rows: {Math.max(...dashboardConfig.charts.map(c => c.position.y + c.position.h), 1)}
                      </div>
                    </div>
                  </div>
                  
                  {/* Row Usage Summary */}
                  {dashboardConfig.charts.length > 0 && (
                    <div className="mt-3 p-3 bg-white dark:bg-gray-800 rounded border">
                      <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Row Usage:</div>
                      {Array.from(new Set(dashboardConfig.charts.map(c => c.position.y))).sort((a, b) => a - b).map(rowY => {
                        const chartsInRow = dashboardConfig.charts.filter(c => c.position.y === rowY);
                        const totalWidth = chartsInRow.reduce((sum, c) => sum + c.position.w, 0);
                        const usagePercentage = ((totalWidth / dashboardConfig.layout.columns) * 100).toFixed(0);
                        
                        return (
                          <div key={rowY} className="flex justify-between items-center text-xs mb-1">
                            <span className="text-gray-600 dark:text-gray-400">Row {rowY}:</span>
                            <span className="text-gray-700 dark:text-gray-300">
                              {chartsInRow.length} charts, {totalWidth}/{dashboardConfig.layout.columns} cols ({usagePercentage}%)
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
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
