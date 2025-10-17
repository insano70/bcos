/**
 * Dashboard Query Builder
 * Provides reusable query patterns for dashboard operations
 */

import { count, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  chart_categories,
  chart_definitions,
  dashboard_charts,
  dashboards,
  users,
} from '@/lib/db/schema';

/**
 * Raw database result from dashboard query (with aggregated chart count)
 * (Before mapping to DashboardWithCharts)
 */
export interface DashboardQueryResult {
  // Dashboard fields
  dashboard_id: string;
  dashboard_name: string;
  dashboard_description: string | null;
  layout_config: unknown;
  dashboard_category_id: number | null;
  organization_id: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  is_active: boolean;
  is_published: boolean;
  is_default: boolean;
  // Category fields
  chart_category_id: number | null;
  category_name: string | null;
  category_description: string | null;
  // Creator fields
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  // Aggregated chart count
  chart_count: number;
}

/**
 * Get the common SELECT fields for dashboard queries
 * This is used across getDashboards and getDashboardById
 * Reduces duplication of 20+ field definitions
 */
export function getDashboardSelectFields() {
  return {
    // Dashboard fields
    dashboard_id: dashboards.dashboard_id,
    dashboard_name: dashboards.dashboard_name,
    dashboard_description: dashboards.dashboard_description,
    layout_config: dashboards.layout_config,
    dashboard_category_id: dashboards.dashboard_category_id,
    organization_id: dashboards.organization_id,
    created_by: dashboards.created_by,
    created_at: dashboards.created_at,
    updated_at: dashboards.updated_at,
    is_active: dashboards.is_active,
    is_published: dashboards.is_published,
    is_default: dashboards.is_default,
    // Category fields
    chart_category_id: chart_categories.chart_category_id,
    category_name: chart_categories.category_name,
    category_description: chart_categories.category_description,
    // Creator fields
    user_id: users.user_id,
    first_name: users.first_name,
    last_name: users.last_name,
    email: users.email,
    // Chart count (aggregated)
    chart_count: count(dashboard_charts.chart_definition_id),
  };
}

/**
 * Get the common query builder with all necessary joins for dashboard list
 * Returns a query builder that can be further filtered with .where()
 *
 * @returns Query builder with SELECT, FROM, and JOINs configured
 */
export function getDashboardQueryBuilder() {
  return db
    .select(getDashboardSelectFields())
    .from(dashboards)
    .leftJoin(
      chart_categories,
      eq(dashboards.dashboard_category_id, chart_categories.chart_category_id)
    )
    .leftJoin(users, eq(dashboards.created_by, users.user_id))
    .leftJoin(dashboard_charts, eq(dashboards.dashboard_id, dashboard_charts.dashboard_id))
    .groupBy(
      dashboards.dashboard_id,
      dashboards.dashboard_name,
      dashboards.dashboard_description,
      dashboards.layout_config,
      dashboards.dashboard_category_id,
      dashboards.organization_id,
      dashboards.created_by,
      dashboards.created_at,
      dashboards.updated_at,
      dashboards.is_active,
      dashboards.is_published,
      dashboards.is_default,
      chart_categories.chart_category_id,
      chart_categories.category_name,
      chart_categories.category_description,
      users.user_id,
      users.first_name,
      users.last_name,
      users.email
    );
}

/**
 * Get chart details for a dashboard
 * Separate query for loading full chart associations with position config
 *
 * @param dashboardId - Dashboard ID to load charts for
 * @returns Array of charts with position config
 */
export async function getDashboardChartDetails(dashboardId: string) {
  return db
    .select({
      chart_definition_id: chart_definitions.chart_definition_id,
      chart_name: chart_definitions.chart_name,
      chart_description: chart_definitions.chart_description,
      chart_type: chart_definitions.chart_type,
      position_config: dashboard_charts.position_config,
    })
    .from(dashboard_charts)
    .innerJoin(
      chart_definitions,
      eq(dashboard_charts.chart_definition_id, chart_definitions.chart_definition_id)
    )
    .where(eq(dashboard_charts.dashboard_id, dashboardId))
    .orderBy(dashboard_charts.added_at);
}
