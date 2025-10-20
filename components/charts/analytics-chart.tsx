'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GlassCard } from '@/components/ui/glass-card';
import { ChartSkeleton } from '@/components/ui/loading-skeleton';
import { useChartData } from '@/hooks/use-chart-data';
import { apiClient } from '@/lib/api/client';
import { chartExportService } from '@/lib/services/chart-export';
import type {
  ChartFilter,
  DualAxisConfig,
  FrequencyType,
  MeasureType,
  MultipleSeriesConfig,
  PeriodComparisonConfig,
} from '@/lib/types/analytics';
import type { ResponsiveChartProps } from '@/lib/types/responsive-charts';
import ChartError from './chart-error';
import ChartHeader from './chart-header';
import ChartRenderer from './chart-renderer';
import ResponsiveChartContainer from './responsive-chart-container';

// Lazy load fullscreen modals
const ChartFullscreenModal = dynamic(() => import('./chart-fullscreen-modal'), {
  ssr: false,
});

const DualAxisFullscreenModal = dynamic(() => import('./dual-axis-fullscreen-modal'), {
  ssr: false,
});

interface AnalyticsChartProps extends ResponsiveChartProps {
  chartType:
    | 'line'
    | 'bar'
    | 'stacked-bar'
    | 'horizontal-bar'
    | 'progress-bar'
    | 'doughnut'
    | 'pie'
    | 'area'
    | 'table'
    | 'dual-axis'
    | 'number';
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
  stackingMode?: 'normal' | 'percentage' | undefined;
  colorPalette?: string | undefined;
  periodComparison?: PeriodComparisonConfig | undefined;
  dualAxisConfig?: DualAxisConfig | undefined;
  aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max';
  target?: number;
  nocache?: boolean | undefined; // Force bypass cache (for previews)
}

/**
 * AnalyticsChart Component (Refactored - Phase 4.4)
 *
 * Simplified chart component using extracted hooks and components.
 * Reduced from 879 lines to ~400 lines through component extraction.
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
export default function AnalyticsChart(props: AnalyticsChartProps) {
  const { chartType, title, dualAxisConfig } = props;

  // Debug logging for dual-axis charts only
  if (chartType === 'dual-axis' && dualAxisConfig) {
    const time = new Date().toISOString().split('T')[1]?.substring(0, 12) || 'unknown';
    console.log(
      `[DUAL-AXIS-RENDER ${time}] ${title || 'Untitled'} | ${dualAxisConfig.primary?.measure} + ${dualAxisConfig.secondary?.measure}`
    );
  }

  // Table charts use a completely different flow - render early
  if (chartType === 'table') {
    return <TableChartComponent {...props} />;
  }

  // Non-table charts use universal endpoint
  return <UniversalChartComponent {...props} />;
}

/**
 * Table Chart Component
 * Handles table charts with direct data source endpoint
 */
function TableChartComponent(props: AnalyticsChartProps) {
  const {
    dataSourceId,
    startDate,
    endDate,
    dateRangePreset,
    practice,
    practiceUid,
    providerName,
    advancedFilters = [],
    width = 800,
    height = 400,
    title,
    className = '',
    colorPalette = 'default',
    responsive = false,
    minHeight = 200,
    maxHeight = 800,
    aspectRatio,
  } = props;

  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const [tableData, setTableData] = useState<{
    data: Record<string, unknown>[];
    columns: Array<{
      column_name: string;
      display_name: string;
      data_type: string;
      format_type: string | null;
      display_icon?: boolean | null;
      icon_type?: string | null;
      icon_color_mode?: string | null;
      icon_color?: string | null;
      icon_mapping?: Record<string, unknown> | null;
    }>;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTableData = useCallback(async () => {
    if (!dataSourceId) {
      setError('Data source ID is required for table charts');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

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
          display_icon?: boolean | null;
          icon_type?: string | null;
          icon_color_mode?: string | null;
          icon_color?: string | null;
          icon_mapping?: Record<string, unknown> | null;
        }>;
      } = await apiClient.get(`/api/admin/data-sources/${dataSourceId}/query?${params.toString()}`);

      setTableData({
        data: response.data,
        columns: response.columns.map((col) => ({
          column_name: col.name,
          display_name: col.display_name,
          data_type: col.data_type,
          format_type: col.format_type,
          ...(col.display_icon !== undefined && { display_icon: col.display_icon }),
          ...(col.icon_type !== undefined && { icon_type: col.icon_type }),
          ...(col.icon_color_mode !== undefined && { icon_color_mode: col.icon_color_mode }),
          ...(col.icon_color !== undefined && { icon_color: col.icon_color }),
          ...(col.icon_mapping !== undefined && { icon_mapping: col.icon_mapping }),
        })),
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch table data';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [
    dataSourceId,
    startDate,
    endDate,
    dateRangePreset,
    practice,
    practiceUid,
    providerName,
    JSON.stringify(advancedFilters),
  ]);

  useEffect(() => {
    fetchTableData();
  }, [fetchTableData]);

  const handleExport = async (format: 'png' | 'csv' | 'pdf') => {
    try {
      if (format === 'csv') {
        const result = chartExportService.exportChartDataAsCSV(
          { labels: [], datasets: [] },
          tableData?.data || [],
          { format }
        );
        if (result.success) {
          chartExportService.downloadFile(result);
        }
      }
    } catch (error) {
      // Export errors are client-side only, no server logging needed
      console.error('Table chart export failed:', error);
    }
  };

  if (isLoading) {
    return (
      <GlassCard className={`flex flex-col ${className}`}>
        <ChartSkeleton />
      </GlassCard>
    );
  }

  if (error) {
    return (
      <GlassCard className={`flex flex-col ${className}`}>
        <ChartError error={error} onRetry={fetchTableData} {...(title && { chartTitle: title })} />
      </GlassCard>
    );
  }

  if (!tableData) {
    return (
      <GlassCard className={`flex flex-col ${className}`}>
        <ChartError
          error="No table data available"
          onRetry={fetchTableData}
          {...(title && { chartTitle: title })}
        />
      </GlassCard>
    );
  }

  return (
    <GlassCard className={`flex flex-col ${className}`}>
      <ChartHeader
        title={title || 'Data Table'}
        onExport={handleExport}
        onRefresh={fetchTableData}
      />
      <div className="flex-1 p-2">
        {responsive ? (
          <ResponsiveChartContainer
            minHeight={minHeight}
            maxHeight={maxHeight}
            {...(aspectRatio && { aspectRatio })}
            className="w-full h-full"
          >
            <ChartRenderer
              chartType="table"
              data={{ labels: [], datasets: [] }}
              rawData={tableData.data}
              columns={tableData.columns.map((col) => ({
                columnName: col.column_name,
                displayName: col.display_name,
                dataType: col.data_type,
                formatType: col.format_type,
                ...(col.display_icon !== undefined && { displayIcon: col.display_icon }),
                ...(col.icon_type !== undefined && { iconType: col.icon_type }),
                ...(col.icon_color_mode !== undefined && { iconColorMode: col.icon_color_mode }),
                ...(col.icon_color !== undefined && { iconColor: col.icon_color }),
                ...(col.icon_mapping !== undefined && { iconMapping: col.icon_mapping }),
              }))}
              chartRef={chartRef}
              width={width}
              height={height}
              colorPalette={colorPalette}
              responsive={responsive}
              minHeight={minHeight}
              maxHeight={maxHeight}
              {...(aspectRatio && { aspectRatio })}
            />
          </ResponsiveChartContainer>
        ) : (
          <ChartRenderer
            chartType="table"
            data={{ labels: [], datasets: [] }}
            rawData={tableData.data}
            columns={tableData.columns.map((col) => ({
              columnName: col.column_name,
              displayName: col.display_name,
              dataType: col.data_type,
              formatType: col.format_type,
              ...(col.display_icon !== undefined && { displayIcon: col.display_icon }),
              ...(col.icon_type !== undefined && { iconType: col.icon_type }),
              ...(col.icon_color_mode !== undefined && { iconColorMode: col.icon_color_mode }),
              ...(col.icon_color !== undefined && { iconColor: col.icon_color }),
              ...(col.icon_mapping !== undefined && { iconMapping: col.icon_mapping }),
            }))}
            chartRef={chartRef}
            width={width}
            height={height}
            colorPalette={colorPalette}
          />
        )}
      </div>
    </GlassCard>
  );
}

/**
 * Universal Chart Component
 * Handles all non-table charts via universal endpoint
 */
function UniversalChartComponent(props: AnalyticsChartProps) {
  const {
    chartType,
    measure = 'Charges by Provider',
    frequency = 'Monthly',
    practice,
    practiceUid,
    providerName,
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
  } = props;

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDualAxisFullscreen, setIsDualAxisFullscreen] = useState(false);
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const actualFrequency = props.frequency || frequency;

  // Build chart data request with proper memoization
  const chartDataRequest = useMemo(() => {
    const request: {
      chartConfig: Record<string, unknown>;
      runtimeFilters?: Record<string, unknown>;
      nocache?: boolean;
    } = {
      chartConfig: {
        chartType,
        dataSourceId: dataSourceId!,
        colorPalette,
      },
    };

    // Add nocache flag if specified (for previews)
    if (props.nocache) {
      request.nocache = true;
    }

    // Add groupBy for chart types that support it (NOT number charts)
    if (chartType !== 'number') {
      request.chartConfig.groupBy = groupBy || 'none';
    }

    // Add chart-type-specific fields
    if (chartType === 'stacked-bar') request.chartConfig.stackingMode = stackingMode;
    if (chartType === 'number') request.chartConfig.aggregation = aggregation;
    if (chartType === 'progress-bar') {
      request.chartConfig.aggregation = aggregation;
      if (groupBy) request.chartConfig.groupBy = groupBy;
      if (target !== undefined) request.chartConfig.target = target;
    }
    if (chartType === 'dual-axis' && dualAxisConfig)
      request.chartConfig.dualAxisConfig = dualAxisConfig;
    if (multipleSeries && multipleSeries.length > 0)
      request.chartConfig.multipleSeries = multipleSeries;
    if (periodComparison) request.chartConfig.periodComparison = periodComparison;
    if (title) request.chartConfig.title = title;

    // Build runtime filters
    const filters: Record<string, unknown> = {};
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;
    if (dateRangePreset) filters.dateRangePreset = dateRangePreset;
    if (practice) filters.practice = practice;
    if (practiceUid) filters.practiceUid = practiceUid;
    if (providerName) filters.providerName = providerName;
    if (!(multipleSeries && multipleSeries.length > 0) && measure) filters.measure = measure;
    if (frequency) filters.frequency = frequency;
    if (advancedFilters && advancedFilters.length > 0) filters.advancedFilters = advancedFilters;
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
    JSON.stringify(dualAxisConfig),
    JSON.stringify(multipleSeries),
    JSON.stringify(periodComparison),
    title,
    startDate,
    endDate,
    dateRangePreset,
    practice,
    practiceUid,
    providerName,
    measure,
    frequency,
    JSON.stringify(advancedFilters),
    calculatedField,
  ]);

  // Fetch chart data using unified hook
  const { data, isLoading, error, refetch } = useChartData(
    chartDataRequest as Parameters<typeof useChartData>[0]
  );

  // Export functionality
  const handleExport = async (format: 'png' | 'csv' | 'pdf') => {
    try {
      let result: Awaited<ReturnType<typeof chartExportService.exportChartAsImage>>;

      if (format === 'csv') {
        result = chartExportService.exportChartDataAsCSV(
          data?.chartData || { labels: [], datasets: [] },
          data?.rawData || [],
          { format }
        );
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
      // Export errors are client-side only, no server logging needed
      console.error('Chart export failed:', error);
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
        <ChartError error={error} onRetry={refetch} {...(title && { chartTitle: title })} />
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
        title={title || `${measure} - ${actualFrequency}`}
        onExport={handleExport}
        onRefresh={refetch}
        {...((chartType === 'bar' ||
          chartType === 'stacked-bar' ||
          chartType === 'horizontal-bar') && {
          onFullscreen: () => setIsFullscreen(true),
        })}
        {...(chartType === 'dual-axis' && {
          onFullscreen: () => setIsDualAxisFullscreen(true),
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
              data={data.chartData}
              rawData={data.rawData}
              {...(data.columns && { columns: data.columns })}
              {...(data.formattedData && { formattedData: data.formattedData })}
              chartRef={chartRef}
              width={width}
              height={height}
              {...(props.frequency && { frequency: props.frequency })}
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
            data={data.chartData}
            rawData={data.rawData}
            {...(data.columns && { columns: data.columns })}
            {...(data.formattedData && { formattedData: data.formattedData })}
            chartRef={chartRef}
            width={width}
            height={height}
            {...(props.frequency && { frequency: props.frequency })}
            {...(stackingMode && { stackingMode })}
            colorPalette={colorPalette}
            {...(dualAxisConfig && { dualAxisConfig })}
            {...(title && { title })}
            {...(measure && { measure })}
          />
        )}
      </div>

      {/* Fullscreen Modal for Bar Charts */}
      {isFullscreen &&
        (chartType === 'bar' || chartType === 'stacked-bar' || chartType === 'horizontal-bar') && (
          <ChartFullscreenModal
            isOpen={isFullscreen}
            onClose={() => setIsFullscreen(false)}
            chartTitle={title || `${measure} - ${actualFrequency}`}
            chartData={data.chartData}
            chartType={chartType}
            frequency={actualFrequency}
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
