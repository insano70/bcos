'use client';

import { useState, useRef, useMemo } from 'react';
import type { MeasureType, FrequencyType, ChartFilter, MultipleSeriesConfig, PeriodComparisonConfig, DualAxisConfig } from '@/lib/types/analytics';
import type { ResponsiveChartProps } from '@/lib/types/responsive-charts';
import { useChartData } from '@/hooks/use-chart-data';
import { chartExportService } from '@/lib/services/chart-export';
import { ChartSkeleton } from '@/components/ui/loading-skeleton';
import { GlassCard } from '@/components/ui/glass-card';
import ChartRenderer from './chart-renderer';
import ChartHeader from './chart-header';
import ChartError from './chart-error';
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

/**
 * AnalyticsChart Component (Refactored - Phase 4.4)
 *
 * Simplified chart component using extracted hooks and components.
 * Reduced from 879 lines to ~200 lines through component extraction.
 *
 * Architecture:
 * - useChartData hook: Unified data fetching (replaces 357 lines)
 * - ChartRenderer: Dynamic chart dispatch (replaces 87 lines)
 * - ChartHeader: Reusable header UI (replaces 93 lines)
 * - ChartError: Error state display (replaces 48 lines)
 *
 * Note: Table charts still use direct endpoint call as they have a different
 * API structure. This will be unified in a future phase.
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

  // Memoize complex dependencies to prevent infinite loops
  const stableAdvancedFilters = useMemo(() => advancedFilters, [JSON.stringify(advancedFilters)]);
  const stableMultipleSeries = useMemo(() => multipleSeries, [JSON.stringify(multipleSeries)]);
  const stablePeriodComparison = useMemo(() => periodComparison, [JSON.stringify(periodComparison)]);

  // Build chart data request
  const chartDataRequest = useMemo(() => {
    const request: {
      chartConfig: Record<string, unknown>;
      runtimeFilters?: Record<string, unknown>;
    } = {
      chartConfig: {
        chartType,
        dataSourceId: dataSourceId!,
        groupBy: groupBy || 'none',
        colorPalette,
      },
    };

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

  // Fetch chart data using unified hook
  const { data, isLoading, error, refetch } = useChartData(chartDataRequest as Parameters<typeof useChartData>[0]);

  // Export functionality
  const handleExport = async (format: 'png' | 'csv' | 'pdf') => {
    try {
      let result;

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
        <ChartRenderer
          chartType={chartType}
          data={data.chartData}
          rawData={data.rawData}
          {...(data.columns && { columns: data.columns })}
          {...(data.formattedData && { formattedData: data.formattedData })}
          chartRef={chartRef}
          width={width}
          height={height}
          {...(frequency && { frequency })}
          {...(stackingMode && { stackingMode })}
          colorPalette={colorPalette}
          {...(dualAxisConfig && { dualAxisConfig })}
          {...(title && { title })}
          {...(measure && { measure })}
          {...(responsive && { responsive })}
          {...(minHeight && { minHeight })}
          {...(maxHeight && { maxHeight })}
          {...(aspectRatio && { aspectRatio })}
        />
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

