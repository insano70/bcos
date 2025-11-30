/**
 * Dashboard Type Definitions
 * Shared types for dashboard services, API routes, and components
 */

import type { DashboardLayout, StoredChartPosition } from './dashboard-config';

/**
 * Chart position for API input (simplified, without chart ID)
 * The chart ID is paired via array index with chart_ids
 */
export interface InputChartPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CreateDashboardData {
  dashboard_name: string;
  dashboard_description?: string | undefined;
  dashboard_category_id?: number | undefined;
  /**
   * Organization ID for dashboard scoping
   * - undefined: defaults to user's current_organization_id (or null if none)
   * - null: creates universal dashboard (visible to all orgs)
   * - UUID: creates org-specific dashboard (visible only to that org)
   */
  organization_id?: string | null | undefined;
  chart_ids?: string[] | undefined;
  chart_positions?: InputChartPosition[] | undefined;
  layout_config?: Partial<DashboardLayout> | undefined;
  is_active?: boolean | undefined;
  is_published?: boolean | undefined;
  is_default?: boolean | undefined;
}

export interface UpdateDashboardData {
  dashboard_name?: string;
  dashboard_description?: string;
  dashboard_category_id?: number;
  /**
   * Organization ID for dashboard scoping
   * - undefined: don't update (keep existing value)
   * - null: set to universal dashboard (visible to all orgs)
   * - UUID: set to org-specific dashboard (visible only to that org)
   */
  organization_id?: string | null;
  chart_ids?: string[];
  chart_positions?: InputChartPosition[];
  layout_config?: Partial<DashboardLayout>;
  is_active?: boolean;
  is_published?: boolean;
  is_default?: boolean;
}

export interface DashboardQueryOptions {
  category_id?: string | undefined;
  is_active?: boolean | undefined;
  is_published?: boolean | undefined;
  search?: string | undefined;
  /**
   * Filter by organization
   * - undefined: apply RBAC-based filtering (universal + user's orgs)
   * - null: only universal dashboards
   * - UUID: only dashboards for that specific org (+ universal)
   */
  organization_id?: string | null | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface DashboardWithCharts {
  dashboard_id: string;
  dashboard_name: string;
  dashboard_description: string | undefined;
  layout_config: DashboardLayout;
  dashboard_category_id: number | undefined;
  organization_id: string | undefined;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  is_published: boolean;
  is_default: boolean;
  chart_count: number;
  category:
    | {
        chart_category_id: number;
        category_name: string;
        category_description: string | undefined;
      }
    | undefined;
  creator:
    | {
        user_id: string;
        first_name: string;
        last_name: string;
        email: string;
      }
    | undefined;
  charts: {
    chart_definition_id: string;
    chart_name: string;
    chart_description: string | undefined;
    chart_type: string;
    position_config: StoredChartPosition | undefined;
  }[];
}

export interface DashboardsServiceInterface {
  getDashboards(options?: DashboardQueryOptions): Promise<DashboardWithCharts[]>;
  getDashboardById(dashboardId: string): Promise<DashboardWithCharts | null>;
  getDashboardCount(options?: DashboardQueryOptions): Promise<number>;
  createDashboard(data: CreateDashboardData): Promise<DashboardWithCharts>;
  updateDashboard(dashboardId: string, data: UpdateDashboardData): Promise<DashboardWithCharts>;
  deleteDashboard(dashboardId: string): Promise<void>;
}
