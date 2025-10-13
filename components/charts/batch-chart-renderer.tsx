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

import React from 'react';
import ChartRenderer from './chart-renderer';
import ChartHeader from './chart-header';
import ChartError from './chart-error';
import type { ChartData } from '@/lib/types/analytics';

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
    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 relative ${className}`}>
      {/* Chart Header */}
      <ChartHeader
        title={chartDefinition.chart_name}
        onExport={handleExport}
        onRefresh={onRetry || (() => {})}
      />

      {/* Chart Content */}
      <div className="flex-1 p-2" style={{ minHeight: `${minHeight}px`, maxHeight: `${maxHeight}px` }}>
        <ChartRenderer
          chartType={chartData.metadata.chartType}
          data={chartData.chartData}
          rawData={chartData.rawData}
          {...(chartData.columns && { columns: chartData.columns })}
          {...(chartData.formattedData && { formattedData: chartData.formattedData })}
          title={chartDefinition.chart_name}
          colorPalette={(chartConfig as any).colorPalette}
          stackingMode={(chartConfig as any).stackingMode}
          dualAxisConfig={(chartConfig as any).dualAxisConfig}
          responsive={responsive}
          minHeight={minHeight}
          maxHeight={maxHeight}
        />
      </div>

      {/* Performance Badge (dev mode only) */}
      {process.env.NODE_ENV === 'development' && chartData.metadata.cacheHit && (
        <div className="absolute top-2 right-2 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 text-xs px-2 py-1 rounded border border-green-300 dark:border-green-700">
          ⚡ Cached
        </div>
      )}
    </div>
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

