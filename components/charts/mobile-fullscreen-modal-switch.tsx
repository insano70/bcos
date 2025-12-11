'use client';

/**
 * MobileFullscreenModalSwitch Component
 *
 * Renders the appropriate fullscreen modal based on chart type for mobile tap-to-zoom.
 * Supports navigation between charts and dashboards with AnimatePresence transitions.
 *
 * Extracted from dashboard-view.tsx for better separation of concerns.
 *
 * @module components/charts/mobile-fullscreen-modal-switch
 */

import dynamic from 'next/dynamic';
import { AnimatePresence } from 'framer-motion';
import type { ChartDefinition } from '@/lib/types/analytics';
import type { BatchChartData } from './batch-chart-renderer';
import { getPresetLabel } from '@/lib/utils/date-presets';

// Lazy load fullscreen modals for mobile tap-to-zoom
const ChartFullscreenModal = dynamic(() => import('./chart-fullscreen-modal'), {
  ssr: false,
});
const DualAxisFullscreenModal = dynamic(() => import('./dual-axis-fullscreen-modal'), {
  ssr: false,
});
const ProgressBarFullscreenModal = dynamic(() => import('./progress-bar-fullscreen-modal'), {
  ssr: false,
});
const NumberFullscreenModal = dynamic(() => import('./number-fullscreen-modal'), {
  ssr: false,
});
const PieFullscreenModal = dynamic(() => import('./pie-fullscreen-modal'), {
  ssr: false,
});
const TableFullscreenModal = dynamic(() => import('./table-fullscreen-modal'), {
  ssr: false,
});

/**
 * Chart configuration for fullscreen modal rendering
 */
export interface FullscreenChartConfig {
  chartDefinitionId: string;
  chartDefinition?: ChartDefinition | undefined;
}

/**
 * Navigation handlers for fullscreen modal
 */
export interface FullscreenNavigationHandlers {
  onClose: () => void;
  onNextChart: () => void;
  onPreviousChart: () => void;
}

/**
 * Cross-dashboard navigation configuration
 */
export interface CrossDashboardNavConfig {
  dashboardName?: string | undefined;
  hasCrossDashboardNav: boolean;
  canGoNextDashboard: boolean;
  canGoPreviousDashboard: boolean;
  onNextDashboard?: (() => void) | undefined;
  onPreviousDashboard?: (() => void) | undefined;
}

/**
 * Props for MobileFullscreenModalSwitch component
 */
interface MobileFullscreenModalSwitchProps {
  /** Whether fullscreen should be shown */
  isOpen: boolean;
  /** Current fullscreen chart index */
  fullscreenIndex: number | null;
  /** Array of chart configurations */
  charts: FullscreenChartConfig[];
  /** Batch data from useDashboardData hook */
  batchData: { charts: Record<string, BatchChartData> } | null;
  /** Navigation handlers */
  navigation: FullscreenNavigationHandlers;
  /** Cross-dashboard navigation config */
  crossDashboardNav: CrossDashboardNavConfig;
  /** Date range preset for filter description (used in number charts) */
  dateRangePreset?: string | undefined;
}

/**
 * Mobile fullscreen modal switch component
 *
 * Renders the appropriate fullscreen modal based on chart type.
 * Uses AnimatePresence for smooth transitions between charts.
 */
export function MobileFullscreenModalSwitch({
  isOpen,
  fullscreenIndex,
  charts,
  batchData,
  navigation,
  crossDashboardNav,
  dateRangePreset,
}: MobileFullscreenModalSwitchProps) {
  return (
    <AnimatePresence mode="wait">
      {isOpen && fullscreenIndex !== null && (() => {
        const currentChart = charts[fullscreenIndex];
        if (!currentChart?.chartDefinition) return null;

        const chartDef = currentChart.chartDefinition;
        const chartIdForData = currentChart.chartDefinitionId;
        const batchChartData = batchData?.charts[chartIdForData] as BatchChartData | undefined;

        if (!batchChartData) return null;

        // Cyclical navigation: always enabled when there's something to navigate to
        // - Multiple charts in single dashboard: cycle within charts
        // - Multiple dashboards: cycle across all dashboards
        // - Single chart in single dashboard: disabled (nothing to cycle)
        const canGoNextChart = charts.length > 1 || crossDashboardNav.hasCrossDashboardNav;
        const canGoPrevChart = charts.length > 1 || crossDashboardNav.hasCrossDashboardNav;

        // Unique key for AnimatePresence to track modal changes
        const modalKey = `fullscreen-${fullscreenIndex}-${chartDef.chart_definition_id}`;

        // Common navigation props for all fullscreen modals
        const navigationProps = {
          onNextChart: navigation.onNextChart,
          onPreviousChart: navigation.onPreviousChart,
          canGoNext: canGoNextChart,
          canGoPrevious: canGoPrevChart,
          chartPosition: `${fullscreenIndex + 1} of ${charts.length}`,
          // Dashboard navigation props
          dashboardName: crossDashboardNav.dashboardName,
          onNextDashboard: crossDashboardNav.onNextDashboard,
          onPreviousDashboard: crossDashboardNav.onPreviousDashboard,
          canGoNextDashboard: crossDashboardNav.canGoNextDashboard,
          canGoPreviousDashboard: crossDashboardNav.canGoPreviousDashboard,
        };

        // Render appropriate fullscreen modal based on chart type
        switch (chartDef.chart_type) {
          case 'bar':
          case 'stacked-bar':
          case 'horizontal-bar':
          case 'line':
          case 'area':
            return (
              <ChartFullscreenModal
                key={modalKey}
                isOpen={true}
                onClose={navigation.onClose}
                chartTitle={chartDef.chart_name}
                chartData={batchChartData.chartData}
                chartType={chartDef.chart_type as 'bar' | 'stacked-bar' | 'horizontal-bar' | 'line' | 'area'}
                frequency={batchChartData.metadata?.frequency || 'Monthly'}
                chartDefinitionId={chartDef.chart_definition_id}
                {...(batchChartData.finalChartConfig && { finalChartConfig: batchChartData.finalChartConfig })}
                {...(batchChartData.runtimeFilters && { runtimeFilters: batchChartData.runtimeFilters })}
                {...navigationProps}
              />
            );

          case 'dual-axis':
            return (
              <DualAxisFullscreenModal
                key={modalKey}
                isOpen={true}
                onClose={navigation.onClose}
                chartTitle={chartDef.chart_name}
                chartData={batchChartData.chartData}
                chartDefinitionId={chartDef.chart_definition_id}
                {...(batchChartData.finalChartConfig && { finalChartConfig: batchChartData.finalChartConfig })}
                {...(batchChartData.runtimeFilters && { runtimeFilters: batchChartData.runtimeFilters })}
                {...navigationProps}
              />
            );

          case 'progress-bar':
            // Progress bar data is constructed from chartData labels and datasets
            return (
              <ProgressBarFullscreenModal
                key={modalKey}
                isOpen={true}
                onClose={navigation.onClose}
                chartTitle={chartDef.chart_name}
                data={batchChartData.chartData.labels.map((label, index) => ({
                  label: String(label),
                  value: ((batchChartData.chartData.datasets[0] as { rawValues?: number[] })?.rawValues?.[index] ?? 0),
                  percentage: (batchChartData.chartData.datasets[0]?.data[index] ?? 0) as number,
                }))}
                {...(batchChartData.chartData.datasets[0] && 'originalMeasureType' in batchChartData.chartData.datasets[0] && {
                  measureType: (batchChartData.chartData.datasets[0] as { originalMeasureType?: string }).originalMeasureType,
                })}
                chartDefinitionId={chartDef.chart_definition_id}
                {...(batchChartData.finalChartConfig && { finalChartConfig: batchChartData.finalChartConfig })}
                {...(batchChartData.runtimeFilters && { runtimeFilters: batchChartData.runtimeFilters })}
                {...navigationProps}
              />
            );

          case 'number':
            return (
              <NumberFullscreenModal
                key={modalKey}
                isOpen={true}
                onClose={navigation.onClose}
                chartTitle={chartDef.chart_name}
                data={batchChartData.chartData}
                {...(dateRangePreset && {
                  filterDescription: getPresetLabel(dateRangePreset) || dateRangePreset,
                })}
                {...navigationProps}
              />
            );

          case 'pie':
          case 'doughnut':
            return (
              <PieFullscreenModal
                key={modalKey}
                isOpen={true}
                onClose={navigation.onClose}
                chartTitle={chartDef.chart_name}
                data={batchChartData.chartData}
                chartType={chartDef.chart_type as 'pie' | 'doughnut'}
                {...navigationProps}
              />
            );

          case 'table':
            return (
              <TableFullscreenModal
                key={modalKey}
                isOpen={true}
                onClose={navigation.onClose}
                chartTitle={chartDef.chart_name}
                data={batchChartData.rawData || []}
                columns={batchChartData.columns || []}
                {...(batchChartData.formattedData && { formattedData: batchChartData.formattedData })}
                {...navigationProps}
              />
            );

          default:
            // Unknown chart type - no fullscreen modal
            return null;
        }
      })()}
    </AnimatePresence>
  );
}

export default MobileFullscreenModalSwitch;
