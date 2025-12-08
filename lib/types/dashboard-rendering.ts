/**
 * Dashboard Rendering Types - Centralized
 *
 * Shared types for dashboard rendering, fullscreen swipe mode, and batch chart data.
 * Centralizes types that were previously defined in hooks/use-dashboard-data.ts.
 *
 * Re-exported from hooks/use-dashboard-data.ts for backward compatibility.
 */

import type { ChartDataStructure } from '@/lib/types/dimensions';

/**
 * Dashboard universal filters (Phase 7)
 * Used for dashboard-level filtering that overrides individual chart filters.
 */
export interface DashboardUniversalFilters {
  startDate?: string | null;
  endDate?: string | null;
  dateRangePreset?: string;
  organizationId?: string | null;
  /** Practice UIDs for filtering - can be manually specified or auto-populated from organizationId */
  practiceUids?: number[];
  providerName?: string | null;
}

/**
 * Raw data row from analytics query
 */
export interface AnalyticsRow {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Chart render result from batch API
 */
export interface ChartRenderResult {
  chartData: ChartDataStructure;
  rawData: AnalyticsRow[];
  metadata: {
    chartType: string;
    dataSourceId: number;
    transformedAt: string;
    queryTimeMs: number;
    cacheHit: boolean;
    recordCount: number;
    transformDuration: number;
  };
}

/**
 * Dashboard batch render response
 */
export interface DashboardRenderResponse {
  /** Map of chart ID to chart data */
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

