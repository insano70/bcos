/**
 * Dashboard Rendering Service - Type Definitions
 *
 * Shared interfaces for the dashboard rendering service layer.
 * These types define the contract between services and API routes.
 */

import type { ChartData } from '@/lib/types/analytics';

/**
 * Dashboard-level universal filters
 * These apply to ALL charts in the dashboard
 *
 * Security Note:
 * - practiceUids is auto-populated from organizationId (includes hierarchy)
 * - Not directly user-editable (security critical)
 */
export interface DashboardUniversalFilters {
  startDate?: string;
  endDate?: string;
  dateRangePreset?: string;
  organizationId?: string;
  providerName?: string;

  // Auto-populated from organizationId (not directly user-editable)
  // Includes hierarchy: if org has children, their practice_uids are included
  practiceUids?: number[];
}

/**
 * Resolved filters after validation and hierarchy resolution
 * Internal type used between services
 */
export interface ResolvedFilters extends DashboardUniversalFilters {
  practiceUids: number[]; // Always resolved (empty array if none)
}

/**
 * Individual chart render result
 */
export interface ChartRenderResult {
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
    // Optional metadata for proper chart rendering
    measure?: string;
    frequency?: string;
    groupBy?: string;
  };
  // Table-specific fields (optional)
  columns?: Array<{
    columnName: string;
    displayName: string;
    dataType: string;
    formatType?: string | null;
  }>;
  formattedData?: Array<Record<string, unknown>>;
}

/**
 * Dashboard render response
 * Returned from the dashboard rendering service
 */
export interface DashboardRenderResponse {
  charts: Record<string, ChartRenderResult>;
  metadata: {
    totalQueryTime: number;
    cacheHits: number;
    cacheMisses: number;
    queriesExecuted: number;
    chartsRendered: number;
    dashboardFiltersApplied: string[];
    parallelExecution: boolean;
  };
}

/**
 * Chart execution configuration
 * Internal type used by chart-config-builder
 */
export interface ChartExecutionConfig {
  chartId: string;
  chartName: string;
  chartType: string;
  finalChartConfig: Record<string, unknown>;
  runtimeFilters: Record<string, unknown>;
  metadata: {
    measure?: string;
    frequency?: string;
    groupBy?: string;
  };
}

/**
 * Batch execution result
 * Internal type used by batch-executor
 */
export interface ExecutionResult {
  results: Array<{
    chartId: string;
    result: ChartRenderResult | null;
  }>;
  stats: {
    cacheHits: number;
    cacheMisses: number;
    totalQueryTime: number;
  };
}

// Re-export types from existing codebase
export type { DashboardWithCharts } from '@/lib/types/dashboards';
export type { ChartWithMetadata as ChartDefinition } from '@/lib/services/rbac-charts-service';
