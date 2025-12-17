/**
 * BatchChartRenderer Component
 *
 * Phase 7: Dashboard Batch Rendering
 *
 * Renders charts using pre-fetched data from batch API without making
 * individual API calls. Works with the dashboard batch rendering system.
 *
 * Key Differences from AnalyticsChart:
 * - No data fetching (accepts pre-fetched data)
 * - No loading states (handled at dashboard level)
 * - Simpler prop interface
 * - Direct rendering only
 *
 * Benefits:
 * - 84% faster dashboard loads (batch vs individual)
 * - No waterfall requests
 * - Simplified component logic
 */

'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GlassCard } from '@/components/ui/glass-card';
import { useChartDrillDown } from '@/hooks/useChartDrillDown';
import { useIsMobile } from '@/hooks/useIsMobile';
import { buildDrillDownConfig } from '@/lib/services/drill-down';
import type { DrillDownFilter, DrillDownResult } from '@/lib/types/drill-down';
import { createChartClickHandler, getPrimaryFieldFromConfig, getSeriesFieldFromConfig } from '@/lib/utils/chart-click-handler';
import { filterChartDataClientSide, canFilterClientSide } from '@/lib/utils/chart-data-filter';
import { chartExportService } from '@/lib/services/chart-export';
import { extractLegendData } from '@/lib/utils/chart-export-legend';
import { getAvailableExportFormats } from '@/lib/utils/chart-export-formats';
import ChartError from './chart-error';
import ChartHeader from './chart-header';
import ChartRenderer from './chart-renderer';
import ResponsiveChartContainer from './responsive-chart-container';
import { DrillDownIcon } from './drill-down-icon';
import { Spinner } from '@/components/ui/spinner';

// Lazy load fullscreen modals (like AnalyticsChart)
const ChartFullscreenModal = dynamic(() => import('./chart-fullscreen-modal'), {
  ssr: false,
});

const DualAxisFullscreenModal = dynamic(() => import('./dual-axis-fullscreen-modal'), {
  ssr: false,
});

const ProgressBarFullscreenModal = dynamic(() => import('./progress-bar-fullscreen-modal'), {
  ssr: false,
});

const DrillDownModal = dynamic(() => import('./drill-down-modal'), {
  ssr: false,
});

/**
 * Chart render result from batch API
 * Re-exported from mappers for consistency across the codebase
 */
import type { BatchChartData } from '@/lib/services/dashboard-rendering/mappers';
export type { BatchChartData };

// DrillDownFilter type is now imported from '@/lib/types/drill-down'

/**
 * BatchChartRenderer props
 */
interface BatchChartRendererProps {
  /**
   * Pre-fetched chart data from batch API
   */
  chartData: BatchChartData;

  /**
   * Chart definition metadata
   */
  chartDefinition: {
    chart_definition_id: string;
    chart_name: string;
    chart_type: string;
    chart_config?: Record<string, unknown>;
    // Drill-down configuration
    drill_down_enabled?: boolean;
    drill_down_type?: string | null;
    drill_down_target_chart_id?: string | null;
    drill_down_button_label?: string;
  };

  /**
   * Position configuration for grid layout
   */
  position: {
    x: number;
    y: number;
    w: number;
    h: number;
  };

  /**
   * Additional styling props
   */
  className?: string;
  responsive?: boolean;
  minHeight?: number;
  maxHeight?: number;

  /**
   * Error handling
   */
  error?: string | null;
  onRetry?: () => void;

  /**
   * Export functionality
   */
  onExport?: (format: 'png' | 'pdf' | 'csv') => void;

  /**
   * Dimension expansion support (passed to fullscreen modals)
   */
  chartDefinitionId?: string;

  /**
   * Hide chart header (for dimension expansion where outer container has header)
   */
  hideHeader?: boolean;

  /**
   * Callback for 'swap' drill-down type
   * Called when user triggers swap to replace this chart with target chart
   */
  onChartSwap?: (sourceChartId: string, targetChartId: string) => void;
}

/**
 * BatchChartRenderer Component
 *
 * Renders a chart using pre-fetched data from the batch API.
 * Does not make any API calls - all data is provided via props.
 *
 * @param props - Chart data and configuration
 * @returns Rendered chart component
 *
 * @example
 * ```tsx
 * <BatchChartRenderer
 *   chartData={batchResponse.charts['chart-123']}
 *   chartDefinition={chartDef}
 *   position={{ x: 0, y: 0, w: 6, h: 4 }}
 * />
 * ```
 */
export default function BatchChartRenderer({
  chartData,
  chartDefinition,
  position,
  className = '',
  responsive = true,
  minHeight = 200,
  maxHeight = 800,
  error = null,
  onRetry,
  onExport,
  chartDefinitionId,
  hideHeader = false,
  onChartSwap,
}: BatchChartRendererProps) {
  // Hooks must be called before any conditional returns
  // Chart ref for export functionality (like AnalyticsChart)
  const chartRef = useRef<HTMLCanvasElement | null>(null);

  // Fullscreen state (like AnalyticsChart lines 382-383)
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDualAxisFullscreen, setIsDualAxisFullscreen] = useState(false);
  const [isProgressBarFullscreen, setIsProgressBarFullscreen] = useState(false);

  // Drill-down state
  const [drillDownModalOpen, setDrillDownModalOpen] = useState(false);
  const [drillDownFilters, setDrillDownFilters] = useState<DrillDownFilter[] | undefined>();
  
  // Local filter state for 'filter' drill-down type (supports multiple filters for multi-series)
  const [localFilters, setLocalFilters] = useState<DrillDownFilter[] | null>(null);
  const [filteredChartData, setFilteredChartData] = useState<BatchChartData | null>(null);
  const [isLoadingFilter, setIsLoadingFilter] = useState(false);

  // Build drill-down config from chart definition
  const drillDownConfig = buildDrillDownConfig({
    drill_down_enabled: chartDefinition.drill_down_enabled ?? null,
    drill_down_type: chartDefinition.drill_down_type ?? null,
    drill_down_target_chart_id: chartDefinition.drill_down_target_chart_id ?? null,
    drill_down_button_label: chartDefinition.drill_down_button_label ?? null,
  });

  // Handle drill-down execution
  const handleDrillDownExecute = useCallback((result: DrillDownResult) => {
    if (result.type === 'filter' && result.filters && result.filters.length > 0) {
      // Apply local filter(s) to current chart (supports multi-series)
      setLocalFilters(result.filters);
    } else if (result.type === 'navigate' && result.targetChartId) {
      setDrillDownFilters(result.targetFilters);
      setDrillDownModalOpen(true);
    } else if (result.type === 'swap' && result.targetChartId && onChartSwap) {
      // Swap current chart with target chart
      onChartSwap(chartDefinition.chart_definition_id, result.targetChartId);
    }
  }, [chartDefinition.chart_definition_id, onChartSwap]);

  // Detect mobile for drill-down UX (mobile shows icon, desktop executes immediately)
  const isMobile = useIsMobile();

  // Drill-down hook
  const drillDown = useChartDrillDown({
    drillDownConfig,
    onDrillDownExecute: handleDrillDownExecute,
    immediateExecute: !isMobile, // Desktop: click executes immediately
    currentFilters: localFilters ?? undefined, // Don't drill-down to same value
  });

  // Clear local filters and revert to original chart
  const clearLocalFilters = useCallback(() => {
    setLocalFilters(null);
    setFilteredChartData(null);
  }, []);

  // Handle refresh button - clears filters if filtered, otherwise calls onRetry
  const handleRefresh = useCallback(() => {
    if (localFilters && localFilters.length > 0) {
      clearLocalFilters();
    } else if (onRetry) {
      onRetry();
    }
  }, [localFilters, clearLocalFilters, onRetry]);

  // Apply filters when localFilters change
  // OPTIMIZED: Use client-side filtering when possible (instant, no network call)
  // Falls back to server-side only when client-side can't handle the filter
  useEffect(() => {
    if (!localFilters || localFilters.length === 0) {
      setFilteredChartData(null);
      return;
    }

    // Try client-side filtering first (instant, no network roundtrip)
    if (canFilterClientSide(chartData, localFilters)) {
      const filtered = filterChartDataClientSide(chartData, localFilters);
      setFilteredChartData(filtered);
      setIsLoadingFilter(false);
      return;
    }

    // Fallback to server-side filtering for complex cases
    // (e.g., date filters that need re-aggregation)
    const fetchFilteredData = async () => {
      setIsLoadingFilter(true);
      try {
        // Import dynamically to avoid circular dependencies
        const { apiClient } = await import('@/lib/api/client');
        const { orchestrationResultToBatchChartData } = await import(
          '@/lib/services/dashboard-rendering/mappers'
        );

        // Build advanced filters from local filters array
        const advancedFilters = localFilters.map((f) => ({
          field: f.field,
          operator: 'eq',
          value: f.value,
        }));

        // Build runtime filters including measure/frequency from original chart data
        const runtimeFilters: Record<string, unknown> = {
          advancedFilters,
        };
        
        // Include measure and frequency if present (required for measure-based data sources)
        if (chartData.metadata.measure) {
          runtimeFilters.measure = chartData.metadata.measure;
        }
        if (chartData.metadata.frequency) {
          runtimeFilters.frequency = chartData.metadata.frequency;
        }

        // Fetch chart data with drill-down filter(s) applied
        const response = await apiClient.post<{
          chartData: BatchChartData['chartData'];
          rawData: BatchChartData['rawData'];
          columns?: BatchChartData['columns'];
          formattedData?: BatchChartData['formattedData'];
          metadata: BatchChartData['metadata'];
        }>('/api/admin/analytics/chart-data/universal', {
          chartDefinitionId: chartDefinition.chart_definition_id,
          runtimeFilters,
        });

        // Convert to BatchChartData format
        const configForMapper: {
          measure?: string;
          frequency?: string;
          groupBy?: string;
          finalChartConfig?: Record<string, unknown>;
          runtimeFilters?: Record<string, unknown>;
        } = {
          runtimeFilters,
        };
        if (chartData.metadata.measure) configForMapper.measure = chartData.metadata.measure;
        if (chartData.metadata.frequency) configForMapper.frequency = chartData.metadata.frequency;
        if (chartData.metadata.groupBy) configForMapper.groupBy = chartData.metadata.groupBy;
        if (chartDefinition.chart_config) configForMapper.finalChartConfig = chartDefinition.chart_config;

        const batchData = orchestrationResultToBatchChartData(
          {
            chartData: response.chartData,
            rawData: response.rawData,
            ...(response.columns && { columns: response.columns }),
            ...(response.formattedData && { formattedData: response.formattedData }),
            metadata: response.metadata,
          },
          configForMapper
        );

        setFilteredChartData(batchData);
      } catch {
        // On error, fall back to original data
        setFilteredChartData(null);
        setLocalFilters(null);
      } finally {
        setIsLoadingFilter(false);
      }
    };

    void fetchFilteredData();
  }, [localFilters, chartDefinition.chart_definition_id, chartDefinition.chart_config, chartData]);

  // Use filtered data if available, otherwise original data
  const activeChartData = filteredChartData ?? chartData;

  // Create Chart.js click handler for drill-down (memoized to prevent chart re-renders)
  const chartJsOnClick = useMemo(() => {
    if (!drillDownConfig.enabled) {
      return undefined;
    }
    // Get the primary field from chart config (groupBy or date)
    const chartConfig = chartDefinition.chart_config || {};
    const primaryField = getPrimaryFieldFromConfig(chartConfig as { groupBy?: string; x_axis?: { field?: string } });
    // Get the series field for multi-series charts
    const seriesField = getSeriesFieldFromConfig(chartConfig as { seriesConfigs?: Array<{ groupBy?: string }>; series?: { groupBy?: string } });
    
    // Build handler params (exactOptionalPropertyTypes compliance)
    const handlerParams: Parameters<typeof createChartClickHandler>[0] = {
      onElementClick: drillDown.handleElementClick,
      primaryField,
      ...(seriesField ? { seriesField } : {}),
    };
    
    return createChartClickHandler(handlerParams);
  }, [drillDownConfig.enabled, chartDefinition.chart_config, drillDown.handleElementClick]);

  // Show error state if provided
  if (error) {
    return (
      <div
        className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}
      >
        <ChartHeader
          title={chartDefinition.chart_name}
          onExport={onExport || (() => {})}
          onRefresh={onRetry || (() => {})}
        />
        <div className="flex-1 p-2">
          <ChartError error={error} onRetry={onRetry || (() => {})} />
        </div>
      </div>
    );
  }

  // Extract chart configuration from definition
  const chartConfig = chartDefinition.chart_config || {};
  const configRecord = chartConfig as Record<string, unknown>;

  const colorPalette = configRecord.colorPalette as string | undefined;
  const stackingMode = configRecord.stackingMode as string | undefined;
  const dualAxisConfig = configRecord.dualAxisConfig as
    | import('@/lib/types/analytics').DualAxisConfig
    | undefined;
  const calculatedField = configRecord.calculatedField as string | undefined;
  // CRITICAL: Field is stored as 'seriesConfigs' in chart_config, not 'multipleSeries'
  const multipleSeries = Array.isArray(configRecord.seriesConfigs)
    ? configRecord.seriesConfigs
    : undefined;
  const target = configRecord.target as number | undefined;
  const aggregation = configRecord.aggregation as string | undefined;
  const advancedFilters = Array.isArray(configRecord.advancedFilters)
    ? configRecord.advancedFilters
    : undefined;
  const dataSourceId = configRecord.dataSourceId as number | undefined;

  // Calculate dimensions from position (approximate grid-based sizing)
  const chartWidth = position.w * 100; // Grid width to pixels
  const chartHeight = position.h * 150; // Grid height to pixels

  // Handle export functionality
  const handleExport = async (format: 'png' | 'pdf' | 'csv') => {
    if (onExport) {
      onExport(format);
      return;
    }

    // CSV export - use raw data
    if (format === 'csv') {
      const csv = convertToCSV(activeChartData.rawData);
      downloadCSV(csv, `${chartDefinition.chart_name}.csv`);
      return;
    }

    // PNG/PDF export - use chartRef to capture canvas with title and legend
    if (chartRef.current) {
      try {
        // Extract legend data for export
        const legendData = extractLegendData(
          activeChartData.chartData,
          activeChartData.chartData.measureType
        );

        const result =
          format === 'pdf'
            ? await chartExportService.exportChartAsPDF(chartRef.current, {
                format,
                filename: `${chartDefinition.chart_name}.pdf`,
                title: chartDefinition.chart_name,
                legendData,
              })
            : await chartExportService.exportChartAsImage(chartRef.current, {
                format,
                filename: `${chartDefinition.chart_name}.png`,
                title: chartDefinition.chart_name,
                legendData,
              });

        if (result.success) {
          chartExportService.downloadFile(result);
        }
      } catch (error) {
        // Client-side export error - use console for debugging
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.error('Export failed:', error);
        }
      }
    }
  };

  return (
    <GlassCard className={`flex flex-col relative ${className}`}>
      {/* Chart Header - Hidden for dimension expansion (outer container has header) */}
      {!hideHeader && (
        <ChartHeader
          title={
            <>
              {chartDefinition.chart_name}
              {process.env.NODE_ENV === 'development' && activeChartData.metadata.cacheHit && (
                <span className="text-[0.65rem] ml-1 opacity-40">⚡</span>
              )}
            </>
          }
          onExport={handleExport}
          availableExportFormats={getAvailableExportFormats(chartDefinition.chart_type)}
          onRefresh={handleRefresh}
          {...((chartDefinition.chart_type === 'bar' ||
            chartDefinition.chart_type === 'stacked-bar' ||
            chartDefinition.chart_type === 'horizontal-bar') && {
            onFullscreen: () => setIsFullscreen(true),
          })}
          {...(chartDefinition.chart_type === 'dual-axis' && {
            onFullscreen: () => setIsDualAxisFullscreen(true),
          })}
          {...(chartDefinition.chart_type === 'progress-bar' && {
            onFullscreen: () => setIsProgressBarFullscreen(true),
          })}
        />
      )}


      {/* Loading overlay when fetching filtered data */}
      {isLoadingFilter && (
        <div className="absolute inset-0 bg-white/50 dark:bg-gray-900/50 flex items-center justify-center z-10 rounded-xl">
          <Spinner sizeClassName="w-6 h-6" borderClassName="border-2" />
        </div>
      )}

      {/* Chart Content - Match AnalyticsChart structure exactly */}
      <div className={`flex-1 ${hideHeader ? 'p-1' : 'p-2'}`}>
        {responsive ? (
          <ResponsiveChartContainer
            minHeight={minHeight}
            maxHeight={maxHeight}
            className="w-full h-full"
          >
            <ChartRenderer
              chartType={activeChartData.metadata.chartType}
              data={activeChartData.chartData}
              rawData={activeChartData.rawData}
              {...(activeChartData.columns && { columns: activeChartData.columns })}
              {...(activeChartData.formattedData && { formattedData: activeChartData.formattedData })}
              chartRef={chartRef}
              width={chartWidth}
              height={chartHeight}
              title={chartDefinition.chart_name}
              {...(activeChartData.metadata.measure && { measure: activeChartData.metadata.measure })}
              {...(activeChartData.metadata.frequency && { frequency: activeChartData.metadata.frequency })}
              {...(activeChartData.metadata.groupBy && { groupBy: activeChartData.metadata.groupBy })}
              {...(colorPalette && { colorPalette })}
              {...(stackingMode && { stackingMode })}
              {...(dualAxisConfig && { dualAxisConfig })}
              {...(calculatedField && { calculatedField })}
              {...(multipleSeries && { multipleSeries })}
              {...(target !== undefined && { target })}
              {...(aggregation && { aggregation })}
              {...(advancedFilters && { advancedFilters })}
              {...(dataSourceId && { dataSourceId })}
              responsive={responsive}
              minHeight={minHeight}
              maxHeight={maxHeight}
              {...(chartJsOnClick && { chartJsOnClick })}
            />
          </ResponsiveChartContainer>
        ) : (
          <ChartRenderer
            chartType={activeChartData.metadata.chartType}
            data={activeChartData.chartData}
            rawData={activeChartData.rawData}
            {...(activeChartData.columns && { columns: activeChartData.columns })}
            {...(activeChartData.formattedData && { formattedData: activeChartData.formattedData })}
            chartRef={chartRef}
            width={chartWidth}
            height={chartHeight}
            title={chartDefinition.chart_name}
            {...(activeChartData.metadata.measure && { measure: activeChartData.metadata.measure })}
            {...(activeChartData.metadata.frequency && { frequency: activeChartData.metadata.frequency })}
            {...(activeChartData.metadata.groupBy && { groupBy: activeChartData.metadata.groupBy })}
            {...(colorPalette && { colorPalette })}
            {...(stackingMode && { stackingMode })}
            {...(dualAxisConfig && { dualAxisConfig })}
            {...(calculatedField && { calculatedField })}
            {...(multipleSeries && { multipleSeries })}
            {...(target !== undefined && { target })}
            {...(aggregation && { aggregation })}
            {...(advancedFilters && { advancedFilters })}
            {...(dataSourceId && { dataSourceId })}
            {...(chartJsOnClick && { chartJsOnClick })}
          />
        )}
      </div>

      {/* Fullscreen Modal for Bar Charts */}
      {isFullscreen &&
        (chartDefinition.chart_type === 'bar' ||
          chartDefinition.chart_type === 'stacked-bar' ||
          chartDefinition.chart_type === 'horizontal-bar') && (
          <ChartFullscreenModal
            isOpen={isFullscreen}
            onClose={() => setIsFullscreen(false)}
            chartTitle={chartDefinition.chart_name}
            chartData={activeChartData.chartData}
            chartType={chartDefinition.chart_type as 'bar' | 'stacked-bar' | 'horizontal-bar'}
            frequency={activeChartData.metadata.frequency || 'Monthly'}
            {...(stackingMode && { stackingMode: stackingMode as 'normal' | 'percentage' })}
            {...(chartDefinitionId && { chartDefinitionId })}
            {...(activeChartData.finalChartConfig && { finalChartConfig: activeChartData.finalChartConfig })}
            {...(activeChartData.runtimeFilters && { runtimeFilters: activeChartData.runtimeFilters })}
            {...(drillDownConfig.enabled && { drillDownConfig, onDrillDownExecute: handleDrillDownExecute })}
          />
        )}

      {/* Dual-Axis Fullscreen Modal */}
      {isDualAxisFullscreen &&
        chartDefinition.chart_type === 'dual-axis' &&
        activeChartData.chartData &&
        dualAxisConfig && (
          <DualAxisFullscreenModal
            isOpen={isDualAxisFullscreen}
            onClose={() => setIsDualAxisFullscreen(false)}
            chartTitle={chartDefinition.chart_name}
            chartData={activeChartData.chartData}
            primaryAxisLabel={dualAxisConfig.primary.axisLabel}
            secondaryAxisLabel={dualAxisConfig.secondary.axisLabel}
            {...(chartDefinitionId && { chartDefinitionId })}
            {...(activeChartData.finalChartConfig && { finalChartConfig: activeChartData.finalChartConfig })}
            {...(activeChartData.runtimeFilters && { runtimeFilters: activeChartData.runtimeFilters })}
          />
        )}

      {/* Progress Bar Fullscreen Modal */}
      {isProgressBarFullscreen && chartDefinition.chart_type === 'progress-bar' && (
        <ProgressBarFullscreenModal
          isOpen={isProgressBarFullscreen}
          onClose={() => setIsProgressBarFullscreen(false)}
          chartTitle={chartDefinition.chart_name}
          data={
            // Extract progress bar data from activeChartData
            activeChartData.chartData.labels.map((label: string | Date, index: number) => ({
              label: String(label),
              value: (activeChartData.chartData.datasets[0]?.rawValues?.[index] ?? 0) as number,
              percentage: (activeChartData.chartData.datasets[0]?.data[index] ?? 0) as number,
            }))
          }
          {...(colorPalette && { colorPalette })}
          // Use originalMeasureType for raw values, not the top-level measureType which is always 'percentage'
          {...(activeChartData.chartData.datasets[0]?.originalMeasureType && {
            measureType: activeChartData.chartData.datasets[0].originalMeasureType as string,
          })}
          {...(chartDefinitionId && { chartDefinitionId })}
          {...(activeChartData.finalChartConfig && { finalChartConfig: activeChartData.finalChartConfig })}
          {...(activeChartData.runtimeFilters && { runtimeFilters: activeChartData.runtimeFilters })}
        />
      )}

      {/* Drill-Down Icon - Mobile only (desktop executes immediately on click) */}
      {drillDownConfig.enabled && isMobile && (
        <DrillDownIcon
          isVisible={drillDown.showDrillDownIcon}
          position={drillDown.iconPosition}
          label={drillDownConfig.buttonLabel}
          onClick={drillDown.executeDrillDown}
          onDismiss={drillDown.dismissIcon}
        />
      )}

      {/* Drill-Down Modal - For navigate type */}
      {drillDownModalOpen && drillDownConfig.targetChartId && (
        <DrillDownModal
          isOpen={drillDownModalOpen}
          onClose={() => setDrillDownModalOpen(false)}
          sourceChartName={chartDefinition.chart_name}
          targetChartId={drillDownConfig.targetChartId}
          {...(drillDownFilters && drillDownFilters.length > 0 ? { appliedFilters: drillDownFilters } : {})}
        />
      )}
    </GlassCard>
  );
}

/**
 * Convert raw data to CSV format
 */
function convertToCSV(data: Record<string, unknown>[]): string {
  if (!data || data.length === 0) return '';

  const headers = Object.keys(data[0] || {});
  const rows = data.map((row) =>
    headers
      .map((header) => {
        const value = row[header];
        // Escape quotes and wrap in quotes if contains comma
        const stringValue = String(value ?? '');
        return stringValue.includes(',') || stringValue.includes('"')
          ? `"${stringValue.replace(/"/g, '""')}"`
          : stringValue;
      })
      .join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Download CSV file
 */
function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
