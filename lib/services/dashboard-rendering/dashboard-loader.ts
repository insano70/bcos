/**
 * Dashboard Loader Service
 *
 * Responsible for loading dashboard definitions and associated chart definitions
 * with RBAC enforcement.
 *
 * Single Responsibility: Load and validate dashboard + charts
 */

import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import { createRBACChartsService } from '@/lib/services/rbac-charts-service';
import { createRBACDashboardsService } from '@/lib/services/dashboards';
import { BaseDashboardRenderingService } from './base-service';
import type { ChartDefinition, DashboardWithCharts } from './types';

/**
 * Dashboard loader result
 */
export interface DashboardLoadResult {
  dashboard: DashboardWithCharts;
  charts: ChartDefinition[];
}

/**
 * Dashboard Loader Service
 *
 * Loads dashboard definitions and associated chart definitions
 * with RBAC enforcement.
 */
export class DashboardLoaderService extends BaseDashboardRenderingService {
  /**
   * Load dashboard with all associated charts
   *
   * Process:
   * 1. Load dashboard definition (RBAC enforced)
   * 2. Extract chart IDs from dashboard
   * 3. Load full chart definitions (RBAC enforced)
   * 4. Filter to active/accessible charts
   *
   * @param dashboardId - Dashboard ID to load
   * @returns Dashboard and charts
   * @throws Error if dashboard not found or not accessible
   */
  async loadDashboardWithCharts(dashboardId: string): Promise<DashboardLoadResult> {
    const startTime = Date.now();

    // 1. Load dashboard definition (RBAC enforced)
    const dashboardsService = createRBACDashboardsService(this.userContext);
    const dashboard = await dashboardsService.getDashboardById(dashboardId);

    if (!dashboard) {
      throw new Error(`Dashboard not found: ${dashboardId}`);
    }

    // 2. Get chart IDs from dashboard
    const dashboardCharts = dashboard.charts || [];

    if (dashboardCharts.length === 0) {
      log.warn('Dashboard has no charts', {
        dashboardId,
        userId: this.userContext.user_id,
        component: 'dashboard-rendering',
      });
      return { dashboard, charts: [] };
    }

    // 3. Load full chart definitions (RBAC enforced)
    const chartsService = createRBACChartsService(this.userContext);
    const chartDefsPromises = dashboardCharts.map((dc) =>
      chartsService.getChartById(dc.chart_definition_id)
    );

    const chartDefs = await Promise.all(chartDefsPromises);

    // 4. Filter to active/accessible charts
    const validCharts = chartDefs.filter((chart) => {
      return chart !== null && chart !== undefined && chart.is_active === true;
    }) as ChartDefinition[];

    const duration = Date.now() - startTime;

    log.info('Dashboard charts loaded', {
      dashboardId,
      userId: this.userContext.user_id,
      totalCharts: dashboardCharts.length,
      validCharts: validCharts.length,
      chartTypes: validCharts.map((c) => c.chart_type),
      duration,
      slow: duration > SLOW_THRESHOLDS.DB_QUERY,
      component: 'dashboard-rendering',
    });

    return { dashboard, charts: validCharts };
  }
}
