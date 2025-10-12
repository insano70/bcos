'use client';

import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import type { MeasureType, FrequencyType, ChartFilter, MultipleSeriesConfig, PeriodComparisonConfig, DualAxisConfig } from '@/lib/types/analytics';
import type { ResponsiveChartProps } from '@/lib/types/responsive-charts';
import { useChartData } from '@/hooks/use-chart-data';
import { chartExportService } from '@/lib/services/chart-export';
import { apiClient } from '@/lib/api/client';
import { ChartSkeleton } from '@/components/ui/loading-skeleton';
import { GlassCard } from '@/components/ui/glass-card';
import ChartRenderer from './chart-renderer';
import ChartHeader from './chart-header';
import ChartError from './chart-error';
import ResponsiveChartContainer from './responsive-chart-container';
import dynamic from 'next/dynamic';

// Lazy load fullscreen modals
const ChartFullscreenModal = dynamic(() => import('./chart-fullscreen-modal'), {
  ssr: false,
});

const DualAxisFullscreenModal = dynamic(() => import('./dual-axis-fullscreen-modal'), {
  ssr: false,
});

interface AnalyticsChartProps extends ResponsiveChartProps {
  chartType: 'line' | 'bar' | 'stacked-bar' | 'horizontal-bar' | 'progress-bar' | 'doughnut' | 'pie' | 'area' | 'table' | 'dual-axis' | 'number';
  measure?: MeasureType;
  frequency?: FrequencyType;
  practice?: string | undefined;
  practiceUid?: string | undefined;
  providerName?: string | undefined;
  providerUid?: string | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
  dateRangePreset?: string | undefined;
  width?: number;
  height?: number;
  title?: string;
  groupBy?: string;
  className?: string;
  calculatedField?: string | undefined;
  advancedFilters?: ChartFilter[];
  multipleSeries?: MultipleSeriesConfig[];
  dataSourceId?: number | undefined;
  stackingMode?: 'normal' | 'percentage';
  colorPalette?: string;
  periodComparison?: PeriodComparisonConfig;
  dualAxisConfig?: DualAxisConfig;
  aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max';
  target?: number;
}

interface FormattedCell {
  formatted: string;
  raw: unknown;
  icon?: {
    name: string;
    color?: string;
    type?: string;
  };
}

/**
 * AnalyticsChart Component (Refactored - Phase 4.4)
 *
 * Simplified chart component using extracted hooks and components.
 * Reduced from 879 lines to ~350 lines through component extraction.
 *
 * Architecture:
 * - useChartData hook: Unified data fetching for non-table charts
 * - ChartRenderer: Dynamic chart dispatch
 * - ChartHeader: Reusable header UI
 * - ChartError: Error state display
 *
 * Note: Table charts use direct endpoint call (/api/admin/data-sources/[id]/query)
 * as they have a different API structure without measure/frequency requirements.
 */
export default function AnalyticsChart({
  chartType,
  measure = 'Charges by Provider',
  frequency = 'Monthly',
  practice,
  practiceUid,
  providerName,
  providerUid,
  startDate,
  endDate,
  dateRangePreset,
  width = 800,
  height = 400,
  title,
  groupBy,
  className = '',
  calculatedField,
  advancedFilters = [],
  multipleSeries = [],
  dataSourceId,
  stackingMode = 'normal',
  colorPalette = 'default',
  periodComparison,
  dualAxisConfig,
  aggregation = 'sum',
  target,
  responsive = false,
  minHeight = 200,
  maxHeight = 800,
  aspectRatio,
}: AnalyticsChartProps) {
  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDualAxisFullscreen, setIsDualAxisFullscreen] = useState(false);
  const chartRef = useRef<HTMLCanvasElement | null>(null);

  // Table-specific state (for direct endpoint)
  const [tableData, setTableData] = useState<{
    data: Record<string, unknown>[];
    columns: Array<{
      column_name: string;
      display_name: string;
      data_type: string;
      format_type: string | null;
    }>;
    formattedData?: Array<Record<string, FormattedCell>>;
  } | null>(null);
  const [tableLoading, setTableLoading] = useState(chartType === 'table');
  const [tableError, setTableError] = useState<string | null>(null);

  // Memoize complex dependencies to prevent infinite loops
  const stableAdvancedFilters = useMemo(() => advancedFilters, [JSON.stringify(advancedFilters)]);
  const stableMultipleSeries = useMemo(() => multipleSeries, [JSON.stringify(multipleSeries)]);
  const stablePeriodComparison = useMemo(() => periodComparison, [JSON.stringify(periodComparison)]);

  // Build chart data request (for non-table charts)
  const chartDataRequest = useMemo(() => {
    if (chartType === 'table') return null;

    const request: {
      chartConfig: Record<string, unknown>;
      runtimeFilters?: Record<string, unknown>;
    } = {
      chartConfig: {
        chartType,
        dataSourceId: dataSourceId!,
        colorPalette,
      },
    };

    // Add groupBy for chart types that support it (NOT number charts)
    if (chartType !== 'number') {
      request.chartConfig.groupBy = groupBy || 'none';
    }

    // Add chart-type-specific fields to chartConfig
    if (chartType === 'stacked-bar') request.chartConfig.stackingMode = stackingMode;
    if (chartType === 'number') request.chartConfig.aggregation = aggregation;
    if (chartType === 'progress-bar') {
      request.chartConfig.aggregation = aggregation;
      if (groupBy) request.chartConfig.groupBy = groupBy;
      if (target !== undefined) request.chartConfig.target = target;
    }
    if (chartType === 'dual-axis' && dualAxisConfig) request.chartConfig.dualAxisConfig = dualAxisConfig;
    if (stableMultipleSeries && stableMultipleSeries.length > 0) request.chartConfig.multipleSeries = stableMultipleSeries;
    if (stablePeriodComparison) request.chartConfig.periodComparison = stablePeriodComparison;
    if (title) request.chartConfig.title = title;

    // Build runtime filters
    const filters: Record<string, unknown> = {};
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (dateRangePreset) filters.dateRangePreset = dateRangePreset;
    if (practice) filters.practice = practice;
    if (practiceUid) filters.practiceUid = practiceUid;
    if (providerName) filters.providerName = providerName;
    if (!(stableMultipleSeries && stableMultipleSeries.length > 0) && measure) filters.measure = measure;
    if (frequency) filters.frequency = frequency;
    if (stableAdvancedFilters && stableAdvancedFilters.length > 0) filters.advancedFilters = stableAdvancedFilters;
    if (calculatedField) filters.calculatedField = calculatedField;

    if (Object.keys(filters).length > 0) {
      request.runtimeFilters = filters;
    }

    return request;
  }, [
    chartType,
    dataSourceId,
    groupBy,
    colorPalette,
    stackingMode,
    aggregation,
    target,
    dualAxisConfig,
    stableMultipleSeries,
    stablePeriodComparison,
    title,
    startDate,
    endDate,
    dateRangePreset,
    practice,
    practiceUid,
    providerName,
    measure,
    frequency,
    stableAdvancedFilters,
    calculatedField,
  ]);

  // Fetch chart data using unified hook (only for non-table charts)
  const universalEndpointResult = useChartData(
    chartDataRequest || { chartConfig: { chartType: 'number', dataSourceId: 0 } } as Parameters<typeof useChartData>[0]
  );

  // Special handling for table charts - use direct data source endpoint
  const fetchTableData = useCallback(async () => {
    if (chartType !== 'table' || !dataSourceId) return;

    setTableLoading(true);
    setTableError(null);

    try {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (dateRangePreset) params.append('date_range_preset', dateRangePreset);
      if (practice) params.append('practice', practice);
      if (practiceUid) params.append('practice_uid', practiceUid);
      if (providerName) params.append('provider_name', providerName);
      if (advancedFilters && advancedFilters.length > 0) {
        params.append('advanced_filters', encodeURIComponent(JSON.stringify(advancedFilters)));
      }
      params.append('limit', '1000');
      params.append('_t', Date.now().toString());

      const response: {
        data: Record<string, unknown>[];
        total_count: number;
        columns: Array<{
          name: string;
          display_name: string;
          data_type: string;
          format_type: string | null;
        }>;
      } = await apiClient.get(`/api/admin/data-sources/${dataSourceId}/query?${params.toString()}`);

      const mappedColumns = (response.columns || []).map(col => ({
        column_name: col.name,
        display_name: col.display_name,
        data_type: col.data_type,
        format_type: col.format_type,
      }));

      setTableData({
        data: response.data,
        columns: mappedColumns,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch table data';
      setTableError(errorMessage);
    } finally {
      setTableLoading(false);
    }
  }, [chartType, dataSourceId, startDate, endDate, dateRangePreset, practice, practiceUid, providerName, stableAdvancedFilters]);

  // Fetch table data on mount/change
  useEffect(() => {
    if (chartType === 'table') {
      fetchTableData();
    }
  }, [chartType, fetchTableData]);

  // Use appropriate data/loading/error based on chart type
  const data = chartType === 'table' ? tableData : universalEndpointResult.data;
  const isLoading = chartType === 'table' ? tableLoading : universalEndpointResult.isLoading;
  const error = chartType === 'table' ? tableError : universalEndpointResult.error;
  const refetch = chartType === 'table' ? fetchTableData : universalEndpointResult.refetch;

  // Export functionality
  const handleExport = async (format: 'png' | 'csv' | 'pdf') => {
    try {
      let result;

      if (format === 'csv') {
        const csvData = chartType === 'table'
          ? { labels: [], datasets: [] }
          : data?.chartData || { labels: [], datasets: [] };
        const csvRawData = chartType === 'table'
          ? tableData?.data || []
          : data?.rawData || [];

        result = chartExportService.exportChartDataAsCSV(csvData, csvRawData, { format });
      } else if (chartRef.current) {
        if (format === 'pdf') {
          result = await chartExportService.exportChartAsPDF(chartRef.current, { format });
        } else {
          result = await chartExportService.exportChartAsImage(chartRef.current, { format });
        }
      } else {
        throw new Error('Chart not available for export');
      }

      if (result.success) {
        chartExportService.downloadFile(result);
      } else {
        throw new Error(result.error || 'Export failed');
      }
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <GlassCard className={`flex flex-col ${className}`}>
        <ChartSkeleton />
      </GlassCard>
    );
  }

  // Error state
  if (error) {
    return (
      <GlassCard className={`flex flex-col ${className}`}>
        <ChartError 
          error={error} 
          onRetry={refetch} 
          {...(title && { chartTitle: title })}
        />
      </GlassCard>
    );
  }

  // Validate data exists
  if (!data) {
    return (
      <GlassCard className={`flex flex-col ${className}`}>
        <ChartError 
          error="No data available" 
          onRetry={refetch} 
          {...(title && { chartTitle: title })}
        />
      </GlassCard>
    );
  }

  // Main render
  return (
    <GlassCard className={`flex flex-col ${className}`}>
      {/* Chart Header */}
      <ChartHeader
        title={title || `${measure} - ${frequency}`}
        onExport={handleExport}
        onRefresh={refetch}
        {...((chartType === 'bar' ||
          chartType === 'stacked-bar' ||
          chartType === 'horizontal-bar') && {
            onFullscreen: () => setIsFullscreen(true)
          })}
        {...(chartType === 'dual-axis' && {
          onFullscreen: () => setIsDualAxisFullscreen(true)
        })}
      />

      {/* Chart Content */}
      <div className="flex-1 p-2">
        {responsive ? (
          <ResponsiveChartContainer
            minHeight={minHeight}
            maxHeight={maxHeight}
            {...(aspectRatio && { aspectRatio })}
            className="w-full h-full"
          >
            <ChartRenderer
              chartType={chartType}
              data={chartType === 'table' 
                ? { labels: [], datasets: [] }
                : data.chartData
              }
              rawData={chartType === 'table' ? tableData?.data : data.rawData}
              {...(chartType === 'table' && tableData && { columns: tableData.columns.map(col => ({
                columnName: col.column_name,
                displayName: col.display_name,
                dataType: col.data_type,
                formatType: col.format_type,
              })) })}
              {...(chartType === 'table' && tableData?.formattedData && { formattedData: tableData.formattedData })}
              {...(chartType !== 'table' && data.columns && { columns: data.columns })}
              {...(chartType !== 'table' && data.formattedData && { formattedData: data.formattedData })}
              chartRef={chartRef}
              width={width}
              height={height}
              {...(frequency && { frequency })}
              {...(stackingMode && { stackingMode })}
              colorPalette={colorPalette}
              {...(dualAxisConfig && { dualAxisConfig })}
              {...(title && { title })}
              {...(measure && { measure })}
              responsive={responsive}
              minHeight={minHeight}
              maxHeight={maxHeight}
              {...(aspectRatio && { aspectRatio })}
            />
          </ResponsiveChartContainer>
        ) : (
          <ChartRenderer
            chartType={chartType}
            data={chartType === 'table' 
              ? { labels: [], datasets: [] }
              : data.chartData
            }
            rawData={chartType === 'table' ? tableData?.data : data.rawData}
            {...(chartType === 'table' && tableData && { columns: tableData.columns.map(col => ({
              columnName: col.column_name,
              displayName: col.display_name,
              dataType: col.data_type,
              formatType: col.format_type,
            })) })}
            {...(chartType === 'table' && tableData?.formattedData && { formattedData: tableData.formattedData })}
            {...(chartType !== 'table' && data.columns && { columns: data.columns })}
            {...(chartType !== 'table' && data.formattedData && { formattedData: data.formattedData })}
            chartRef={chartRef}
            width={width}
            height={height}
            {...(frequency && { frequency })}
            {...(stackingMode && { stackingMode })}
            colorPalette={colorPalette}
            {...(dualAxisConfig && { dualAxisConfig })}
            {...(title && { title })}
            {...(measure && { measure })}
          />
        )}
      </div>

      {/* Fullscreen Modal for Bar Charts */}
      {isFullscreen && (chartType === 'bar' || chartType === 'stacked-bar' || chartType === 'horizontal-bar') && (
        <ChartFullscreenModal
          isOpen={isFullscreen}
          onClose={() => setIsFullscreen(false)}
          chartTitle={title || `${measure} - ${frequency}`}
          chartData={data.chartData}
          chartType={chartType}
          frequency={frequency}
          stackingMode={stackingMode}
        />
      )}

      {/* Dual-Axis Fullscreen Modal */}
      {isDualAxisFullscreen && chartType === 'dual-axis' && data.chartData && dualAxisConfig && (
        <DualAxisFullscreenModal
          isOpen={isDualAxisFullscreen}
          onClose={() => setIsDualAxisFullscreen(false)}
          chartTitle={title || 'Dual-Axis Chart'}
          chartData={data.chartData}
          primaryAxisLabel={dualAxisConfig.primary.axisLabel}
          secondaryAxisLabel={dualAxisConfig.secondary.axisLabel}
        />
      )}
    </GlassCard>
  );
}

// Component presets moved to analytics-chart-presets.tsx (Phase 4.4.2)

