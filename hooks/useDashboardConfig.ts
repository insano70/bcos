/**
 * useDashboardConfig Hook
 *
 * Builds the dashboard configuration from dashboard data and chart definitions.
 * Memoized to prevent unnecessary re-renders and stabilize object references.
 *
 * Extracted from dashboard-view.tsx for better separation of concerns.
 *
 * @module hooks/useDashboardConfig
 */

import { useMemo } from 'react';
import { DASHBOARD_LAYOUT } from '@/lib/constants/dashboard-layout';
import type {
  ChartConfig,
  ChartDataSourceConfig,
  ChartDefinition,
  Dashboard,
  DashboardChart,
} from '@/lib/types/analytics';
import type { DashboardChartConfig, DashboardLayoutConfig } from '@/components/charts/dashboard-chart-grid';

/**
 * Extended chart config with pre-extracted data source
 */
export interface DashboardChartConfigWithDataSource extends DashboardChartConfig {
  dataSource: ChartDataSourceConfig;
}

/**
 * Dashboard configuration result
 */
export interface DashboardConfig {
  /** Dashboard display name */
  dashboardName: string;
  /** Dashboard description */
  dashboardDescription: string;
  /** Array of chart configurations with pre-extracted configs */
  charts: DashboardChartConfigWithDataSource[];
  /** Grid layout configuration */
  layout: DashboardLayoutConfig;
}

/**
 * Options for useDashboardConfig hook
 */
export interface UseDashboardConfigOptions {
  /** Dashboard entity */
  dashboard: Dashboard;
  /** Array of dashboard chart associations */
  dashboardCharts: DashboardChart[];
  /** Map of chart definitions by ID for O(1) lookups */
  chartsById: Map<string, ChartDefinition>;
}

/**
 * Default empty data source configuration
 */
const EMPTY_DATA_SOURCE: ChartDataSourceConfig = {
  table: '',
  filters: [],
  orderBy: [],
};

/**
 * Default empty chart config
 */
const EMPTY_CHART_CONFIG: ChartConfig = {
  x_axis: { field: '', label: '', format: 'string' },
  y_axis: { field: '', label: '', format: 'number' },
  options: { responsive: true, showLegend: true, showTooltips: true, animation: true },
};

/**
 * Hook to build dashboard configuration from dashboard data
 *
 * Features:
 * - Memoized computation for performance
 * - O(1) chart definition lookups via chartsById Map
 * - Stabilized object references to prevent re-renders
 * - Default values for missing configurations
 *
 * @param options - Dashboard, charts, and chartsById map
 * @returns Memoized dashboard configuration
 *
 * @example
 * ```tsx
 * const dashboardConfig = useDashboardConfig({
 *   dashboard,
 *   dashboardCharts,
 *   chartsById,
 * });
 *
 * return (
 *   <DashboardChartGrid
 *     charts={dashboardConfig.charts}
 *     layout={dashboardConfig.layout}
 *     ...
 *   />
 * );
 * ```
 */
export function useDashboardConfig(options: UseDashboardConfigOptions): DashboardConfig {
  const { dashboard, dashboardCharts, chartsById } = options;

  return useMemo(
    () => ({
      dashboardName: dashboard.dashboard_name || 'Unnamed Dashboard',
      dashboardDescription: dashboard.dashboard_description || '',
      charts:
        dashboardCharts
          ?.map((chartAssoc, index) => {
            // O(1) lookup using chartsById Map instead of repeated .find()
            const chartDefinition = chartsById.get(chartAssoc.chart_definition_id);

            // Extract and stabilize config objects to prevent duplicate renders
            const dataSource: ChartDataSourceConfig =
              chartDefinition?.data_source || EMPTY_DATA_SOURCE;
            const chartConfig: ChartConfig =
              chartDefinition?.chart_config || EMPTY_CHART_CONFIG;

            return {
              id: `dashboard-chart-${index}`,
              chartDefinitionId: chartAssoc.chart_definition_id,
              position: chartAssoc.position_config,
              chartDefinition,
              // Pre-extract configs to stabilize object references
              dataSource,
              chartConfig,
            };
          })
          .filter((chart) => chart.chartDefinition) || [],
      layout: {
        columns: dashboard.layout_config?.columns || DASHBOARD_LAYOUT.GRID_COLUMNS,
        rowHeight: dashboard.layout_config?.rowHeight || DASHBOARD_LAYOUT.ROW_HEIGHT,
        margin: dashboard.layout_config?.margin || DASHBOARD_LAYOUT.MARGIN,
      },
    }),
    [dashboard, dashboardCharts, chartsById]
  );
}

export default useDashboardConfig;
