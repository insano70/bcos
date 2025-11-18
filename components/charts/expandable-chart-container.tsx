'use client';

/**
 * Expandable Chart Container
 *
 * Simple wrapper that passes chart data to BatchChartRenderer.
 * Dimension expansion now happens inside the fullscreen modals.
 */

import type { DashboardUniversalFilters } from '@/hooks/use-dashboard-data';
import BatchChartRenderer, { type BatchChartData } from './batch-chart-renderer';

// Position config type
interface ChartPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ExpandableChartContainerProps {
  chartDefinitionId: string;
  chartData: BatchChartData;
  chartDefinition: {
    chart_definition_id: string;
    chart_name: string;
    chart_type: string;
    chart_config?: Record<string, unknown>;
  };
  position: ChartPosition;
  currentFilters: DashboardUniversalFilters;
  className?: string;
  responsive?: boolean;
  minHeight?: number;
  maxHeight?: number;
  onFullscreen?: () => void;
  onRetry?: () => void;
  onExport?: (format: 'png' | 'pdf' | 'csv') => void;
}

export default function ExpandableChartContainer({
  chartDefinitionId,
  chartData,
  chartDefinition,
  position,
  currentFilters,
  className,
  responsive,
  minHeight,
  maxHeight,
  onFullscreen,
  onRetry,
  onExport,
}: ExpandableChartContainerProps) {
  // Pass through to BatchChartRenderer with dimension expansion context
  return (
    <BatchChartRenderer
      chartData={chartData}
      chartDefinition={chartDefinition}
      position={position}
      {...(chartDefinitionId && { chartDefinitionId })}
      {...(currentFilters && { currentFilters: currentFilters as Record<string, unknown> })}
      {...(className && { className })}
      {...(responsive !== undefined && { responsive })}
      {...(minHeight !== undefined && { minHeight })}
      {...(maxHeight !== undefined && { maxHeight })}
      {...(onFullscreen && { onFullscreen })}
      {...(onRetry && { onRetry })}
      {...(onExport && { onExport })}
    />
  );
}

