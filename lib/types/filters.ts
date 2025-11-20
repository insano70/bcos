/**
 * Unified Filter Types for Charting System
 *
 * Provides type-safe filter hierarchy to eliminate format conversions
 * and type casting throughout the analytics pipeline.
 *
 * Type Hierarchy:
 * - UniversalChartFilters: External API input (from dashboards, dimension expansion)
 * - ChartExecutionFilters: Internal normalized format (after resolution)
 * - AnalyticsQueryParams: Final SQL builder format (re-exported from analytics.ts)
 *
 * Benefits:
 * - No more Record<string, unknown>
 * - No more "as unknown as" casts
 * - Compiler-enforced structure
 * - Clear conversion boundaries
 */

import type { ChartFilter } from './analytics';

/**
 * Universal Chart Filters
 *
 * External API input format used across all chart systems.
 * Accepts filters from dashboards, dimension expansion, and direct API calls.
 *
 * Organization Resolution:
 * - organizationId provided → resolves to practiceUids (with hierarchy)
 * - practiceUids provided → used directly
 * - Neither provided → no practice filtering (all accessible practices)
 *
 * Security:
 * - organizationId requires RBAC validation
 * - practiceUids are validated against accessible_practices
 * - Empty practiceUids array triggers fail-closed security
 */
export interface UniversalChartFilters {
  /** Start date for date range filter (ISO format) */
  startDate?: string;

  /** End date for date range filter (ISO format) */
  endDate?: string;

  /** Date range preset (e.g., 'last_30_days', 'this_month') */
  dateRangePreset?: string;

  /**
   * Organization ID for filtering
   * Will be resolved to practiceUids with hierarchy
   * Requires RBAC validation
   */
  organizationId?: string;

  /**
   * Explicit practice UIDs for filtering
   * Alternative to organizationId (takes precedence if both provided)
   */
  practiceUids?: number[];

  /** Provider name for filtering (fuzzy match) */
  providerName?: string;

  /** Measure for measure-based data sources */
  measure?: string;

  /** Frequency/time period for measure-based data sources */
  frequency?: string;

  /**
   * Advanced filters (field-level filtering)
   * Array of structured filter objects
   */
  advancedFilters?: ChartFilter[];
}

/**
 * Chart Execution Filters
 *
 * Internal normalized format after validation and resolution.
 * Used throughout chart execution pipeline.
 *
 * Guarantees:
 * - Date range always resolved (from preset or explicit dates)
 * - organizationId resolved to practiceUids
 * - All optional fields properly typed
 * - No unknown types
 */
export interface ChartExecutionFilters {
  /**
   * Resolved date range
   * Always populated (from explicit dates or preset)
   */
  dateRange: {
    startDate: string;
    endDate: string;
  };

  /**
   * Resolved practice UIDs
   * - Empty array = no practice filtering (all accessible)
   * - Has values = filter to these practices
   * - Already validated against accessible_practices
   */
  practiceUids: number[];

  /** Measure for measure-based data sources */
  measure?: string;

  /** Frequency/time period for measure-based data sources */
  frequency?: string;

  /** Provider name for filtering */
  providerName?: string;

  /**
   * Advanced filters (consolidated)
   * Includes:
   * - Chart-level advanced filters (from chart definition)
   * - Dashboard-level advanced filters (from universal filters)
   * - Auto-generated filters (e.g., practiceUids → practice_uid IN filter)
   */
  advancedFilters: ChartFilter[];
}

/**
 * Filter Resolution Result
 *
 * Returned by organization filter resolution.
 * Contains resolved practice UIDs and original organization ID.
 */
export interface FilterResolutionResult {
  /** Resolved practice UIDs (includes hierarchy) */
  practiceUids: number[];

  /** Original organization ID */
  organizationId: string;

  /** Whether resolution included child organizations */
  includesHierarchy: boolean;
}

/**
 * Filter Builder Options
 *
 * Configuration for filter building behavior.
 */
export interface FilterBuilderOptions {
  /** Component name for logging (e.g., 'dashboard-rendering', 'dimension-expansion') */
  component: string;

  /** Whether to enforce fail-closed security for empty practiceUids */
  failClosedSecurity?: boolean;

  /** Default limit for analytics queries */
  defaultLimit?: number;

  /** Data source type (affects required filters) */
  dataSourceType?: 'measure-based' | 'table-based';
}

/**
 * Type guard: Check if filters have organization ID
 */
export function hasOrganizationFilter(
  filters: UniversalChartFilters
): filters is UniversalChartFilters & { organizationId: string } {
  return typeof filters.organizationId === 'string' && filters.organizationId.length > 0;
}

/**
 * Type guard: Check if filters have explicit practice UIDs
 */
export function hasPracticeUidsFilter(
  filters: UniversalChartFilters
): filters is UniversalChartFilters & { practiceUids: number[] } {
  return Array.isArray(filters.practiceUids) && filters.practiceUids.length > 0;
}

/**
 * Type guard: Check if filters have date range
 */
export function hasDateRangeFilter(
  filters: UniversalChartFilters
): filters is UniversalChartFilters & { startDate: string; endDate: string } {
  return (
    typeof filters.startDate === 'string' &&
    typeof filters.endDate === 'string' &&
    filters.startDate.length > 0 &&
    filters.endDate.length > 0
  );
}

/**
 * Type guard: Check if filters have date range preset
 */
export function hasDateRangePreset(
  filters: UniversalChartFilters
): filters is UniversalChartFilters & { dateRangePreset: string } {
  return typeof filters.dateRangePreset === 'string' && filters.dateRangePreset.length > 0;
}

