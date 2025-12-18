'use client';

/**
 * DashboardChartGrid Component
 *
 * Renders the dashboard chart grid with support for:
 * - Chart swapping via drill-down
 * - Mobile tap-to-zoom interaction
 * - Batch data rendering
 * - Error boundaries per chart
 *
 * Extracted from dashboard-view.tsx for better separation of concerns.
 *
 * @module components/charts/dashboard-chart-grid
 */

import { RefreshCcw } from 'lucide-react';
import {
  DASHBOARD_LAYOUT,
  getResponsiveColSpan,
} from '@/lib/constants/dashboard-layout';
import { DASHBOARD_MESSAGES } from '@/lib/constants/dashboard-messages';
import type { ChartConfig, ChartDefinition } from '@/lib/types/analytics';
import type { BatchChartData } from './batch-chart-renderer';
import BatchChartRenderer from './batch-chart-renderer';
import ChartErrorBoundary from './chart-error-boundary';
import { DashboardCardFrame, DashboardChartPlaceholder } from './dashboard-chart-placeholder';

/**
 * Chart configuration within the dashboard grid
 */
export interface DashboardChartConfig {
  id: string;
  chartDefinitionId: string;
  position: { x: number; y: number; w: number; h: number };
  chartDefinition?: ChartDefinition | undefined;
  chartConfig: ChartConfig;
}

/**
 * Layout configuration for the dashboard grid
 */
export interface DashboardLayoutConfig {
  columns: number;
  rowHeight: number;
  margin: number;
}

/**
 * Props for DashboardChartGrid component
 */
interface DashboardChartGridProps {
  /** Array of chart configurations to render */
  charts: DashboardChartConfig[];
  /** Layout configuration */
  layout: DashboardLayoutConfig;
  /** Batch data from useDashboardData hook */
  batchData: { charts: Record<string, BatchChartData> } | null;
  /** Map of chart definitions by ID for O(1) lookups */
  chartsById: Map<string, ChartDefinition>;
  /** Map of swapped charts: originalChartId -> targetChartId */
  swappedCharts: Map<string, string>;
  /** Whether the user is on mobile */
  isMobile: boolean;
  /** Handle chart swap from drill-down */
  onChartSwap: (sourceChartId: string, targetChartId: string) => void;
  /** Handle reverting a swapped chart */
  onRevertSwap: (sourceChartId: string) => void;
  /** Handle mobile chart tap for fullscreen */
  onMobileChartTap?: ((chartIndex: number) => void) | undefined;
}

/**
 * Dashboard chart grid component
 *
 * Renders charts in a responsive 12-column grid with:
 * - Staggered entrance animations
 * - Chart swapping support
 * - Mobile tap-to-zoom interaction
 * - Error boundaries per chart
 */
export function DashboardChartGrid({
  charts,
  layout,
  batchData,
  chartsById,
  swappedCharts,
  isMobile,
  onChartSwap,
  onRevertSwap,
  onMobileChartTap,
}: DashboardChartGridProps) {
  return (
    <div className="grid grid-cols-12 gap-6 w-full px-4 pb-4">
      {charts.map((dashboardChart, chartIndex) => {
        if (!dashboardChart.chartDefinition) {
          return (
            <DashboardChartPlaceholder
              key={dashboardChart.id}
              id={dashboardChart.id}
              chartIndex={chartIndex}
              colSpanClass={getResponsiveColSpan(dashboardChart.position.w)}
              message={DASHBOARD_MESSAGES.ERRORS.CHART_NOT_FOUND}
              chartId={dashboardChart.chartDefinitionId}
            />
          );
        }

        // Use pre-extracted configs from memoized dashboardConfig
        const originalChartDef = dashboardChart.chartDefinition;
        const originalChartConfig = dashboardChart.chartConfig;

        // Check if this chart has been swapped via drill-down
        const swappedToChartId = swappedCharts.get(dashboardChart.chartDefinitionId);
        const isSwapped = !!swappedToChartId;

        // Determine which chart to render (original or swapped)
        // O(1) lookup using chartsById Map
        const swappedChartDef = isSwapped && swappedToChartId
          ? chartsById.get(swappedToChartId)
          : null;

        const chartDef = swappedChartDef ?? originalChartDef;
        const chartConfig = swappedChartDef?.chart_config ?? originalChartConfig;

        // Use responsive sizing that respects dashboard configuration
        const baseHeight = dashboardChart.position.h * DASHBOARD_LAYOUT.CHART.HEIGHT_MULTIPLIER;
        const containerHeight = Math.max(baseHeight, DASHBOARD_LAYOUT.CHART.MIN_HEIGHT);

        // Determine responsive column span classes
        const colSpanClass = getResponsiveColSpan(dashboardChart.position.w);

        // Get batch data for the chart being rendered
        // For swapped charts, we need to fetch data from a different source
        const chartIdForData = isSwapped && swappedToChartId
          ? swappedToChartId
          : dashboardChart.chartDefinitionId;
        const batchChartData = batchData?.charts[chartIdForData];

        // Skip chart if no data returned from batch API
        if (!batchChartData) {
          return (
            <DashboardChartPlaceholder
              key={dashboardChart.id}
              id={dashboardChart.id}
              chartIndex={chartIndex}
              colSpanClass={colSpanClass}
              message={DASHBOARD_MESSAGES.ERRORS.CHART_DATA_UNAVAILABLE}
              chartId={chartIdForData}
              onRevert={isSwapped ? () => onRevertSwap(dashboardChart.chartDefinitionId) : undefined}
            />
          );
        }

        return (
          <DashboardCardFrame
            key={dashboardChart.id}
            id={dashboardChart.id}
            chartIndex={chartIndex}
            colSpanClass={colSpanClass}
            containerHeight={containerHeight}
            layoutMargin={layout.margin}
            isMobile={isMobile}
            onClick={isMobile && onMobileChartTap ? () => onMobileChartTap(chartIndex) : undefined}
          >
            {/* Swap indicator with revert button */}
            {isSwapped && (
              <div className="absolute top-0 right-0 z-10 flex items-center gap-1 px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 text-xs rounded-bl-lg rounded-tr-xl">
                <span className="hidden sm:inline">
                  Swapped from: {originalChartDef.chart_name.slice(0, 15)}...
                </span>
                <button
                  type="button"
                  onClick={() => onRevertSwap(dashboardChart.chartDefinitionId)}
                  className="p-0.5 hover:bg-amber-200 dark:hover:bg-amber-800 rounded transition-colors"
                  title="Revert to original chart"
                  aria-label="Revert to original chart"
                >
                  <RefreshCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Chart with dimension expansion support (via fullscreen modals) - wrap with error boundary */}
            <ChartErrorBoundary chartName={chartDef.chart_name}>
              <BatchChartRenderer
                chartDefinitionId={chartDef.chart_definition_id}
                chartData={batchChartData as BatchChartData}
                chartDefinition={{
                  chart_definition_id: chartDef.chart_definition_id,
                  chart_name: chartDef.chart_name,
                  chart_type: chartDef.chart_type,
                  chart_config: chartConfig,
                  // Pass drill-down config from chart definition (only if defined)
                  ...(chartDef.drill_down_enabled !== undefined && {
                    drill_down_enabled: chartDef.drill_down_enabled,
                  }),
                  ...(chartDef.drill_down_type !== undefined && {
                    drill_down_type: chartDef.drill_down_type,
                  }),
                  ...(chartDef.drill_down_target_chart_id !== undefined && {
                    drill_down_target_chart_id: chartDef.drill_down_target_chart_id,
                  }),
                  ...(chartDef.drill_down_button_label !== undefined && {
                    drill_down_button_label: chartDef.drill_down_button_label,
                  }),
                }}
                position={dashboardChart.position}
                className="w-full h-full flex-1"
                responsive={true}
                minHeight={DASHBOARD_LAYOUT.CHART.MIN_HEIGHT_WITH_PADDING}
                maxHeight={containerHeight - DASHBOARD_LAYOUT.CHART.HEIGHT_PADDING}
                onChartSwap={onChartSwap}
                {...((chartDef.chart_type === 'bar' ||
                  chartDef.chart_type === 'stacked-bar' ||
                  chartDef.chart_type === 'horizontal-bar' ||
                  chartDef.chart_type === 'dual-axis') && {
                  onFullscreen: () => {}, // Will be handled by BatchChartRenderer internally
                })}
              />
            </ChartErrorBoundary>
          </DashboardCardFrame>
        );
      })}
    </div>
  );
}

export default DashboardChartGrid;
