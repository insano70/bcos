/**
 * Dashboard Result Mappers
 *
 * Pure functions for mapping database results to domain types.
 * Centralizes all result transformation logic to ensure consistency
 * across getDashboards and getDashboardById operations.
 *
 * Benefits:
 * - DRY principle: Eliminates duplicate mapping code
 * - Consistency: Single source of truth for result structure
 * - Testability: Pure functions, easy to unit test
 */

import type { DashboardWithCharts } from '@/lib/types/dashboards';
import type { DashboardQueryResult } from './query-builder';

/**
 * Chart detail structure (subset of full chart definition)
 * Used in dashboard chart list
 */
export interface ChartDetail {
  chart_definition_id: string;
  chart_name: string;
  chart_description: string | null;
  chart_type: string;
  position_config: unknown;
}

/**
 * Map database query result to DashboardWithCharts
 *
 * Handles all the complex transformations:
 * - Null handling and default values
 * - Date serialization to ISO strings
 * - Type coercion (layout_config, chart_count)
 * - Nested object mapping (category, creator)
 * - Chart association
 *
 * Shared helper used by:
 * - core-service.getDashboards()
 * - core-service.getDashboardById()
 *
 * @param dashboard - Raw database result from query builder
 * @param charts - Optional array of associated charts with position config
 * @returns Fully mapped DashboardWithCharts object
 *
 * @example
 * ```typescript
 * const dbResult = await getDashboardQueryBuilder().where(...);
 * const charts = await getDashboardChartDetails(dbResult.dashboard_id);
 * const mapped = mapDashboardResult(dbResult, charts);
 * ```
 */
export function mapDashboardResult(
  dashboard: DashboardQueryResult,
  charts: ChartDetail[] = []
): DashboardWithCharts {
  return {
    // Core dashboard fields
    dashboard_id: dashboard.dashboard_id,
    dashboard_name: dashboard.dashboard_name,
    dashboard_description: dashboard.dashboard_description || undefined,
    layout_config: (dashboard.layout_config as Record<string, unknown>) || {},
    dashboard_category_id: dashboard.dashboard_category_id || undefined,
    organization_id: dashboard.organization_id || undefined,
    created_by: dashboard.created_by,
    created_at: (dashboard.created_at || new Date()).toISOString(),
    updated_at: (dashboard.updated_at || new Date()).toISOString(),

    // Boolean flags with defaults
    is_active: dashboard.is_active ?? true,
    is_published: dashboard.is_published ?? false,
    is_default: dashboard.is_default ?? false,

    // Aggregated chart count (from JOIN + GROUP BY)
    chart_count: Number(dashboard.chart_count) || 0,

    // Related entities (category, creator)
    category: mapCategoryResult(dashboard),
    creator: mapCreatorResult(dashboard),

    // Associated charts with position configuration
    charts: charts.map(mapChartDetail),
  };
}

/**
 * Map category fields from dashboard query result
 *
 * Handles null category (dashboard not assigned to a category).
 * Returns undefined if no category is associated.
 *
 * @param dashboard - Raw database result
 * @returns Category object or undefined
 */
function mapCategoryResult(dashboard: DashboardQueryResult):
  | {
      chart_category_id: number;
      category_name: string;
      category_description: string | undefined;
    }
  | undefined {
  // If any category field is null, the dashboard has no category
  if (!dashboard.chart_category_id || !dashboard.category_name) {
    return undefined;
  }

  return {
    chart_category_id: dashboard.chart_category_id,
    category_name: dashboard.category_name,
    category_description: dashboard.category_description || undefined,
  };
}

/**
 * Map creator (user) fields from dashboard query result
 *
 * Handles null creator (user may have been deleted).
 * Returns undefined if creator information is not available.
 *
 * @param dashboard - Raw database result
 * @returns Creator object or undefined
 */
function mapCreatorResult(dashboard: DashboardQueryResult):
  | {
      user_id: string;
      first_name: string;
      last_name: string;
      email: string;
    }
  | undefined {
  // If any user field is null, creator info is incomplete
  if (!dashboard.user_id || !dashboard.first_name || !dashboard.last_name || !dashboard.email) {
    return undefined;
  }

  return {
    user_id: dashboard.user_id,
    first_name: dashboard.first_name,
    last_name: dashboard.last_name,
    email: dashboard.email,
  };
}

/**
 * Map chart detail from database result
 *
 * Handles null description and position_config with defaults.
 *
 * @param chart - Raw chart detail from getDashboardChartDetails
 * @returns Mapped chart with position configuration
 */
function mapChartDetail(chart: ChartDetail): {
  chart_definition_id: string;
  chart_name: string;
  chart_description: string | undefined;
  chart_type: string;
  position_config: Record<string, unknown> | undefined;
} {
  return {
    chart_definition_id: chart.chart_definition_id,
    chart_name: chart.chart_name,
    chart_description: chart.chart_description || undefined,
    chart_type: chart.chart_type,
    position_config: (chart.position_config as Record<string, unknown>) || undefined,
  };
}

/**
 * Map array of database results to DashboardWithCharts array
 *
 * Convenience helper for mapping lists without charts.
 * For individual dashboards with full chart details, use mapDashboardResult directly.
 *
 * @param dashboards - Array of database results
 * @returns Array of mapped dashboards (without charts)
 *
 * @example
 * ```typescript
 * const dbResults = await getDashboardQueryBuilder().where(...);
 * const dashboards = mapDashboardList(dbResults);
 * ```
 */
export function mapDashboardList(dashboards: DashboardQueryResult[]): DashboardWithCharts[] {
  return dashboards.map((dashboard) => mapDashboardResult(dashboard, []));
}
