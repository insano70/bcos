import type { DashboardFilterConfig } from '@/components/charts/dashboard-filter-bar';
import type {
  DashboardChartSlot,
  DashboardRow,
  RowBasedDashboardConfig,
} from '@/components/charts/dashboard-row-builder';
import type { ChartDefinition } from '@/lib/types/analytics';

interface EditingDashboard {
  dashboard_id?: string;
  dashboard_name?: string;
  dashboard_description?: string;
  is_published?: boolean;
  charts?: Array<{
    dashboard_chart_id: string;
    chart_definition_id: string;
    position_config?: {
      x?: number;
      y?: number;
      w?: number;
      h?: number;
    };
  }>;
  layout_config?: Record<string, unknown>;
}

/**
 * Convert grid-based dashboard layout to row-based layout
 *
 * Takes a legacy grid-based dashboard (12-column grid with x,y,w,h positions)
 * and converts it to our row-based layout system.
 *
 * @param dashboard - The existing dashboard to convert
 * @param availableCharts - All available chart definitions for lookup
 * @returns Row-based dashboard configuration
 */
export function convertGridToRows(
  dashboard: EditingDashboard,
  availableCharts: ChartDefinition[]
): RowBasedDashboardConfig {
  const rows: DashboardRow[] = [];

  if (dashboard.charts && Array.isArray(dashboard.charts)) {
    // Group charts by Y position (row index)
    const rowsMap = new Map<number, DashboardChartSlot[]>();

    dashboard.charts.forEach((chartAssoc, index: number) => {
      const y = chartAssoc.position_config?.y || 0;
      const chartDefinition = availableCharts.find(
        (chart) => chart.chart_definition_id === chartAssoc.chart_definition_id
      );

      if (chartDefinition) {
        const chartSlot: DashboardChartSlot = {
          id: `chart-${y}-${chartAssoc.dashboard_chart_id}-${index}`,
          chartDefinitionId: chartAssoc.chart_definition_id,
          chartDefinition,
          // Convert 12-column grid width to percentage (e.g., 6/12 = 50%)
          widthPercentage: Math.round(((chartAssoc.position_config?.w || 6) / 12) * 100),
        };

        if (!rowsMap.has(y)) {
          rowsMap.set(y, []);
        }
        const chartSlots = rowsMap.get(y);
        if (chartSlots) {
          chartSlots.push(chartSlot);
        }
      }
    });

    // Convert map to rows array, sorted by Y position
    const sortedRows = Array.from(rowsMap.entries()).sort(([a], [b]) => a - b);

    for (const [y, charts] of sortedRows) {
      // Calculate row height based on the tallest chart in the row
      const maxHeightInGridRows = Math.max(
        1,
        ...charts.map((chart) => {
          const chartAssoc = dashboard.charts?.find(
            (c) => c.chart_definition_id === chart.chartDefinitionId
          );
          return chartAssoc?.position_config?.h || 2;
        })
      );

      const rowHeight =
        typeof dashboard.layout_config?.rowHeight === 'number'
          ? dashboard.layout_config.rowHeight
          : 150;

      rows.push({
        id: `row-${y}-${Date.now()}`,
        heightPx: rowHeight * maxHeightInGridRows,
        charts,
      });
    }
  }

  return {
    dashboardName: dashboard.dashboard_name || '',
    dashboardDescription: dashboard.dashboard_description || '',
    rows,
  };
}

/**
 * Convert row-based configuration to API format
 *
 * Transforms our row-based dashboard config into the format expected by the API.
 * Also includes legacy grid-based positions for backward compatibility.
 *
 * @param config - The row-based dashboard configuration
 * @param filterConfig - Dashboard filter configuration
 * @param editingDashboard - Original dashboard being edited (to preserve is_published)
 * @returns API-compatible dashboard payload
 */
export function convertRowsToApiFormat(
  config: RowBasedDashboardConfig,
  filterConfig: DashboardFilterConfig,
  editingDashboard?: EditingDashboard
): Record<string, unknown> {
  const payload = {
    dashboard_name: config.dashboardName,
    dashboard_description: config.dashboardDescription,
    layout_config: {
      type: 'row-based',
      rows: config.rows.map((row) => ({
        heightPx: row.heightPx,
        charts: row.charts.map((chart) => ({
          chartDefinitionId: chart.chartDefinitionId,
          widthPercentage: chart.widthPercentage,
        })),
      })),
      filterConfig,
    },
    // Legacy format for backward compatibility
    // Convert to grid positions (12-column grid system)
    chart_ids: config.rows.flatMap((row) =>
      row.charts
        .filter((chart) => chart.chartDefinitionId)
        .map((chart) => chart.chartDefinitionId)
        .filter((id): id is string => id !== undefined)
    ),
    chart_positions: config.rows.flatMap((row, rowIndex) =>
      row.charts
        .filter((chart) => chart.chartDefinitionId)
        .map((chart, chartIndex) => ({
          x: chartIndex * 2, // Approximate grid X position
          y: rowIndex, // Row index becomes Y position
          w: Math.round((chart.widthPercentage / 100) * 12), // Convert percentage to 12-col grid
          h: Math.round(row.heightPx / 150), // Convert pixels to grid rows (150px per row)
        }))
    ),
  };

  // When editing, preserve the existing is_published status
  if (editingDashboard) {
    return {
      ...payload,
      is_published: editingDashboard.is_published,
    };
  }

  return payload;
}
