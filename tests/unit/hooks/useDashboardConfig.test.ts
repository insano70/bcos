/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDashboardConfig } from '@/hooks/useDashboardConfig';
import type { ChartDefinition, Dashboard, DashboardChart } from '@/lib/types/analytics';

// Test fixture factories
function createMockDashboard(overrides?: Partial<Dashboard>): Dashboard {
  return {
    dashboard_id: 'dashboard-1',
    dashboard_name: 'Test Dashboard',
    dashboard_description: 'A test dashboard',
    layout_config: {
      columns: 12,
      rowHeight: 100,
      margin: 16,
    },
    created_by: 'user-1',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    is_active: true,
    is_published: true,
    is_default: false,
    ...overrides,
  } as Dashboard;
}

function createMockDashboardChart(
  chartDefinitionId: string,
  position = { x: 0, y: 0, w: 6, h: 2 }
): DashboardChart {
  return {
    dashboard_chart_id: `dc-${chartDefinitionId}`,
    dashboard_id: 'dashboard-1',
    chart_definition_id: chartDefinitionId,
    position_config: position,
    added_at: '2024-01-01T00:00:00Z',
  };
}

function createMockChartDefinition(id: string, overrides?: Partial<ChartDefinition>): ChartDefinition {
  return {
    chart_definition_id: id,
    chart_name: `Chart ${id}`,
    chart_type: 'bar',
    data_source: {
      table: 'test_table',
      filters: [],
      orderBy: [],
    },
    chart_config: {
      x_axis: { field: 'date', label: 'Date', format: 'date' },
      y_axis: { field: 'value', label: 'Value', format: 'number' },
      options: { responsive: true, showLegend: true, showTooltips: true, animation: true },
    },
    is_active: true,
    created_by: 'user-1',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  } as ChartDefinition;
}

describe('useDashboardConfig', () => {
  describe('dashboard metadata', () => {
    it('should return dashboard name and description', () => {
      const dashboard = createMockDashboard({
        dashboard_name: 'Sales Dashboard',
        dashboard_description: 'Monthly sales metrics',
      });

      const { result } = renderHook(() =>
        useDashboardConfig({
          dashboard,
          dashboardCharts: [],
          chartsById: new Map(),
        })
      );

      expect(result.current.dashboardName).toBe('Sales Dashboard');
      expect(result.current.dashboardDescription).toBe('Monthly sales metrics');
    });

    it('should use default name when dashboard_name is empty', () => {
      const dashboard = createMockDashboard({
        dashboard_name: '',
      });

      const { result } = renderHook(() =>
        useDashboardConfig({
          dashboard,
          dashboardCharts: [],
          chartsById: new Map(),
        })
      );

      expect(result.current.dashboardName).toBe('Unnamed Dashboard');
    });

    it('should handle missing description', () => {
      const dashboard = createMockDashboard();
      // Manually unset description to simulate missing field
      (dashboard as { dashboard_description?: string | undefined }).dashboard_description = undefined;

      const { result } = renderHook(() =>
        useDashboardConfig({
          dashboard,
          dashboardCharts: [],
          chartsById: new Map(),
        })
      );

      expect(result.current.dashboardDescription).toBe('');
    });
  });

  describe('layout configuration', () => {
    it('should return layout from dashboard config', () => {
      const dashboard = createMockDashboard({
        layout_config: {
          columns: 6,
          rowHeight: 150,
          margin: 24,
        },
      });

      const { result } = renderHook(() =>
        useDashboardConfig({
          dashboard,
          dashboardCharts: [],
          chartsById: new Map(),
        })
      );

      expect(result.current.layout).toEqual({
        columns: 6,
        rowHeight: 150,
        margin: 24,
      });
    });

    it('should use defaults when layout_config is missing', () => {
      const dashboard = createMockDashboard({
        layout_config: undefined as unknown as Dashboard['layout_config'],
      });

      const { result } = renderHook(() =>
        useDashboardConfig({
          dashboard,
          dashboardCharts: [],
          chartsById: new Map(),
        })
      );

      // Should use DASHBOARD_LAYOUT defaults
      expect(result.current.layout.columns).toBe(12);
      expect(result.current.layout.rowHeight).toBeGreaterThan(0);
      expect(result.current.layout.margin).toBeGreaterThan(0);
    });
  });

  describe('charts configuration', () => {
    it('should map dashboard charts with O(1) lookups', () => {
      const chartDef1 = createMockChartDefinition('chart-1');
      const chartDef2 = createMockChartDefinition('chart-2');

      const chartsById = new Map<string, ChartDefinition>([
        ['chart-1', chartDef1],
        ['chart-2', chartDef2],
      ]);

      const dashboardCharts = [
        createMockDashboardChart('chart-1', { x: 0, y: 0, w: 6, h: 2 }),
        createMockDashboardChart('chart-2', { x: 6, y: 0, w: 6, h: 2 }),
      ];

      const { result } = renderHook(() =>
        useDashboardConfig({
          dashboard: createMockDashboard(),
          dashboardCharts,
          chartsById,
        })
      );

      expect(result.current.charts).toHaveLength(2);
      expect(result.current.charts[0]?.chartDefinitionId).toBe('chart-1');
      expect(result.current.charts[0]?.chartDefinition).toBe(chartDef1);
      expect(result.current.charts[1]?.chartDefinitionId).toBe('chart-2');
      expect(result.current.charts[1]?.chartDefinition).toBe(chartDef2);
    });

    it('should filter out charts without definitions', () => {
      const chartDef1 = createMockChartDefinition('chart-1');

      const chartsById = new Map<string, ChartDefinition>([
        ['chart-1', chartDef1],
        // chart-2 is NOT in the map
      ]);

      const dashboardCharts = [
        createMockDashboardChart('chart-1'),
        createMockDashboardChart('chart-2'), // This one won't have a definition
        createMockDashboardChart('chart-3'), // This one won't have a definition either
      ];

      const { result } = renderHook(() =>
        useDashboardConfig({
          dashboard: createMockDashboard(),
          dashboardCharts,
          chartsById,
        })
      );

      // Only chart-1 should be included
      expect(result.current.charts).toHaveLength(1);
      expect(result.current.charts[0]?.chartDefinitionId).toBe('chart-1');
    });

    it('should assign unique IDs to each chart', () => {
      const chartDef = createMockChartDefinition('chart-1');

      const chartsById = new Map<string, ChartDefinition>([
        ['chart-1', chartDef],
      ]);

      const dashboardCharts = [
        createMockDashboardChart('chart-1'),
      ];

      const { result } = renderHook(() =>
        useDashboardConfig({
          dashboard: createMockDashboard(),
          dashboardCharts,
          chartsById,
        })
      );

      expect(result.current.charts[0]?.id).toBe('dashboard-chart-0');
    });

    it('should include position config from dashboard chart', () => {
      const chartDef = createMockChartDefinition('chart-1');

      const chartsById = new Map<string, ChartDefinition>([
        ['chart-1', chartDef],
      ]);

      const dashboardCharts = [
        createMockDashboardChart('chart-1', { x: 3, y: 4, w: 8, h: 3 }),
      ];

      const { result } = renderHook(() =>
        useDashboardConfig({
          dashboard: createMockDashboard(),
          dashboardCharts,
          chartsById,
        })
      );

      expect(result.current.charts[0]?.position).toEqual({ x: 3, y: 4, w: 8, h: 3 });
    });

    it('should pre-extract chart config for stable references', () => {
      const chartDef = createMockChartDefinition('chart-1', {
        chart_config: {
          x_axis: { field: 'month', label: 'Month', format: 'string' },
          y_axis: { field: 'sales', label: 'Sales', format: 'currency' },
          options: { responsive: true, showLegend: false, showTooltips: true, animation: false },
        },
      });

      const chartsById = new Map<string, ChartDefinition>([
        ['chart-1', chartDef],
      ]);

      const dashboardCharts = [
        createMockDashboardChart('chart-1'),
      ];

      const { result } = renderHook(() =>
        useDashboardConfig({
          dashboard: createMockDashboard(),
          dashboardCharts,
          chartsById,
        })
      );

      expect(result.current.charts[0]?.chartConfig).toEqual(chartDef.chart_config);
      expect(result.current.charts[0]?.dataSource).toEqual(chartDef.data_source);
    });
  });

  describe('memoization', () => {
    it('should return same reference when inputs unchanged', () => {
      const dashboard = createMockDashboard();
      const dashboardCharts: DashboardChart[] = [];
      const chartsById = new Map<string, ChartDefinition>();

      const { result, rerender } = renderHook(() =>
        useDashboardConfig({
          dashboard,
          dashboardCharts,
          chartsById,
        })
      );

      const firstResult = result.current;

      rerender();

      expect(result.current).toBe(firstResult);
    });

    it('should return new reference when dashboard changes', () => {
      const dashboard1 = createMockDashboard({ dashboard_name: 'Dashboard 1' });
      const dashboard2 = createMockDashboard({ dashboard_name: 'Dashboard 2' });
      const dashboardCharts: DashboardChart[] = [];
      const chartsById = new Map<string, ChartDefinition>();

      const { result, rerender } = renderHook(
        ({ dashboard }) =>
          useDashboardConfig({
            dashboard,
            dashboardCharts,
            chartsById,
          }),
        { initialProps: { dashboard: dashboard1 } }
      );

      const firstResult = result.current;

      rerender({ dashboard: dashboard2 });

      expect(result.current).not.toBe(firstResult);
      expect(result.current.dashboardName).toBe('Dashboard 2');
    });
  });

  describe('empty state', () => {
    it('should handle empty dashboard charts', () => {
      const { result } = renderHook(() =>
        useDashboardConfig({
          dashboard: createMockDashboard(),
          dashboardCharts: [],
          chartsById: new Map(),
        })
      );

      expect(result.current.charts).toEqual([]);
    });

    it('should handle null dashboardCharts gracefully', () => {
      const { result } = renderHook(() =>
        useDashboardConfig({
          dashboard: createMockDashboard(),
          dashboardCharts: null as unknown as DashboardChart[],
          chartsById: new Map(),
        })
      );

      expect(result.current.charts).toEqual([]);
    });
  });
});
