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

import React, { useRef, useState } from 'react';
import ChartRenderer from './chart-renderer';
import ChartHeader from './chart-header';
import ChartError from './chart-error';
import ResponsiveChartContainer from './responsive-chart-container';
import { GlassCard } from '@/components/ui/glass-card';
import type { ChartData } from '@/lib/types/analytics';
import dynamic from 'next/dynamic';

// Lazy load fullscreen modals (like AnalyticsChart)
const ChartFullscreenModal = dynamic(() => import('./chart-fullscreen-modal'), {
  ssr: false,
});

const DualAxisFullscreenModal = dynamic(() => import('./dual-axis-fullscreen-modal'), {
  ssr: false,
});

/**
 * Formatted cell structure for table charts (from batch API)
 */
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
 * Column definition for table charts
 */
interface ColumnDefinition {
  columnName: string;
  displayName: string;
  dataType: string;
  formatType?: string | null;
  displayIcon?: boolean | null;
  iconType?: string | null;
  iconColorMode?: string | null;
  iconColor?: string | null;
  iconMapping?: Record<string, unknown> | null;
}

/**
 * Chart render result from batch API
 */
export interface BatchChartData {
  chartData: ChartData;
  rawData: Record<string, unknown>[];
  metadata: {
    chartType: string;
    dataSourceId: number;
    transformedAt: string;
    queryTimeMs: number;
    cacheHit: boolean;
    recordCount: number;
    transformDuration: number;
    // FIX #7: Add these for proper rendering
    measure?: string;
    frequency?: string;
    groupBy?: string;
  };
  
  // Table-specific data (optional)
  columns?: ColumnDefinition[];
  formattedData?: Array<Record<string, FormattedCell>>;
}

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
}: BatchChartRendererProps) {
  // Show error state if provided
  if (error) {
    return (
      <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 ${className}`}>
        <ChartHeader
          title={chartDefinition.chart_name}
          onExport={onExport || (() => {})}
          onRefresh={onRetry || (() => {})}
        />
        <div className="flex-1 p-2">
          <ChartError
            error={error}
            onRetry={onRetry || (() => {})}
          />
        </div>
      </div>
    );
  }

  // Extract chart configuration from definition
  const chartConfig = chartDefinition.chart_config || {};
  const configRecord = chartConfig as Record<string, unknown>;
  const colorPalette = configRecord.colorPalette as string | undefined;
  const stackingMode = configRecord.stackingMode as string | undefined;
  const dualAxisConfig = configRecord.dualAxisConfig as import('@/lib/types/analytics').DualAxisConfig | undefined;
  const calculatedField = configRecord.calculatedField as string | undefined;
  // CRITICAL: Field is stored as 'seriesConfigs' in chart_config, not 'multipleSeries'
  const multipleSeries = configRecord.seriesConfigs as unknown[] | undefined;
  const target = configRecord.target as number | undefined;
  const aggregation = configRecord.aggregation as string | undefined;
  const advancedFilters = configRecord.advancedFilters as unknown[] | undefined;
  const dataSourceId = configRecord.dataSourceId as number | undefined;
  
  // Calculate dimensions from position (approximate grid-based sizing)
  const chartWidth = position.w * 100; // Grid width to pixels
  const chartHeight = position.h * 150; // Grid height to pixels
  
  // Chart ref for export functionality (like AnalyticsChart)
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  
  // Fullscreen state (like AnalyticsChart lines 382-383)
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDualAxisFullscreen, setIsDualAxisFullscreen] = useState(false);
  
  // Handle export functionality
  const handleExport = (format: 'png' | 'pdf' | 'csv') => {
    if (onExport) {
      onExport(format);
      return;
    }

    // Default export behavior
    if (format === 'csv') {
      // Export raw data as CSV
      const csv = convertToCSV(chartData.rawData);
      downloadCSV(csv, `${chartDefinition.chart_name}.csv`);
    }
    // PNG/PDF export handled by chart component internally
  };

  return (
    <GlassCard className={`flex flex-col ${className}`}>
      {/* Chart Header */}
      <ChartHeader
        title={
          <>
            {chartDefinition.chart_name}
            {process.env.NODE_ENV === 'development' && chartData.metadata.cacheHit && (
              <span className="text-[0.65rem] ml-1 opacity-40">⚡</span>
            )}
          </>
        }
        onExport={handleExport}
        onRefresh={onRetry || (() => {})}
        {...((chartDefinition.chart_type === 'bar' ||
          chartDefinition.chart_type === 'stacked-bar' ||
          chartDefinition.chart_type === 'horizontal-bar') && {
            onFullscreen: () => setIsFullscreen(true)
          })}
        {...(chartDefinition.chart_type === 'dual-axis' && {
          onFullscreen: () => setIsDualAxisFullscreen(true)
        })}
      />

      {/* Chart Content - Match AnalyticsChart structure exactly */}
      <div className="flex-1 p-2">
        {responsive ? (
          <ResponsiveChartContainer
            minHeight={minHeight}
            maxHeight={maxHeight}
            className="w-full h-full"
          >
            <ChartRenderer
              chartType={chartData.metadata.chartType}
              data={chartData.chartData}
              rawData={chartData.rawData}
              {...(chartData.columns && { columns: chartData.columns })}
              {...(chartData.formattedData && { formattedData: chartData.formattedData })}
              chartRef={chartRef}
              width={chartWidth}
              height={chartHeight}
              title={chartDefinition.chart_name}
              {...(chartData.metadata.measure && { measure: chartData.metadata.measure })}
              {...(chartData.metadata.frequency && { frequency: chartData.metadata.frequency })}
              {...(chartData.metadata.groupBy && { groupBy: chartData.metadata.groupBy })}
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
            />
          </ResponsiveChartContainer>
        ) : (
          <ChartRenderer
            chartType={chartData.metadata.chartType}
            data={chartData.chartData}
            rawData={chartData.rawData}
            {...(chartData.columns && { columns: chartData.columns })}
            {...(chartData.formattedData && { formattedData: chartData.formattedData })}
            chartRef={chartRef}
            width={chartWidth}
            height={chartHeight}
            title={chartDefinition.chart_name}
            {...(chartData.metadata.measure && { measure: chartData.metadata.measure })}
            {...(chartData.metadata.frequency && { frequency: chartData.metadata.frequency })}
            {...(chartData.metadata.groupBy && { groupBy: chartData.metadata.groupBy })}
            {...(colorPalette && { colorPalette })}
            {...(stackingMode && { stackingMode })}
            {...(dualAxisConfig && { dualAxisConfig })}
            {...(calculatedField && { calculatedField })}
            {...(multipleSeries && { multipleSeries })}
            {...(target !== undefined && { target })}
            {...(aggregation && { aggregation })}
            {...(advancedFilters && { advancedFilters })}
            {...(dataSourceId && { dataSourceId })}
          />
        )}
      </div>

      {/* Fullscreen Modal for Bar Charts */}
      {isFullscreen && (chartDefinition.chart_type === 'bar' || chartDefinition.chart_type === 'stacked-bar' || chartDefinition.chart_type === 'horizontal-bar') && (
        <ChartFullscreenModal
          isOpen={isFullscreen}
          onClose={() => setIsFullscreen(false)}
          chartTitle={chartDefinition.chart_name}
          chartData={chartData.chartData}
          chartType={chartDefinition.chart_type as 'bar' | 'stacked-bar' | 'horizontal-bar'}
          frequency={chartData.metadata.frequency || 'Monthly'}
          {...(stackingMode && { stackingMode: stackingMode as 'normal' | 'percentage' })}
        />
      )}

      {/* Dual-Axis Fullscreen Modal */}
      {isDualAxisFullscreen && chartDefinition.chart_type === 'dual-axis' && chartData.chartData && dualAxisConfig && (
        <DualAxisFullscreenModal
          isOpen={isDualAxisFullscreen}
          onClose={() => setIsDualAxisFullscreen(false)}
          chartTitle={chartDefinition.chart_name}
          chartData={chartData.chartData}
          primaryAxisLabel={dualAxisConfig.primary.axisLabel}
          secondaryAxisLabel={dualAxisConfig.secondary.axisLabel}
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
  const rows = data.map(row =>
    headers.map(header => {
      const value = row[header];
      // Escape quotes and wrap in quotes if contains comma
      const stringValue = String(value ?? '');
      return stringValue.includes(',') || stringValue.includes('"')
        ? `"${stringValue.replace(/"/g, '""')}"`
        : stringValue;
    }).join(',')
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

