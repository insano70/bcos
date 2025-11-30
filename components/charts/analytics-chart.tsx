'use client';

import dynamic from 'next/dynamic';
import { useMemo, useRef, useState } from 'react';
import { GlassCard } from '@/components/ui/glass-card';
import { ChartSkeleton } from '@/components/ui/loading-skeleton';
import { useChartData } from '@/hooks/use-chart-data';
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
  chartDefinitionId?: string | undefined; // For cache key uniqueness
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
 * AnalyticsChart Component (Refactored - Phase 7)
 *
 * Simplified chart component using extracted hooks and components.
 * Reduced from 879 lines to ~170 lines through component extraction and table migration.
 *
 * Architecture:
 * - useChartData hook: Unified data fetching for ALL chart types (including tables)
 * - ChartRenderer: Dynamic chart dispatch
 * - ChartHeader: Reusable header UI
 * - ChartError: Error state display
 *
 * All charts (including tables) now use the universal endpoint:
 * POST /api/admin/analytics/chart-data/universal
 *
 * Benefits: server-side formatting, Redis caching, consistent architecture
 */
export default function AnalyticsChart(props: AnalyticsChartProps) {
  // All charts (including table) use universal endpoint
  return <UniversalChartComponent {...props} />;
}

/**
 * Universal Chart Component
 * Handles all charts (including tables) via universal endpoint
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
      chartDefinitionId?: string;
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

    // Include chartDefinitionId at top level for cache key uniqueness
    if (props.chartDefinitionId) {
      request.chartDefinitionId = props.chartDefinitionId;
    }

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
    props.chartDefinitionId,
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
    props.nocache,
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
        {...((chartType === 'line' ||
          chartType === 'bar' ||
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

      {/* Fullscreen Modal for Line and Bar Charts */}
      {isFullscreen &&
        (chartType === 'line' ||
          chartType === 'bar' ||
          chartType === 'stacked-bar' ||
          chartType === 'horizontal-bar') && (
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
