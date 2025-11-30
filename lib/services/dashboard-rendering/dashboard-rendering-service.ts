/**
 * Dashboard Rendering Service - Facade
 *
 * Orchestrates dashboard rendering by delegating to specialized services.
 * This is the main entry point for dashboard batch rendering.
 *
 * Single Responsibility: Orchestrate service calls (no business logic)
 *
 * Architecture:
 * - DashboardLoaderService: Load dashboard + charts (RBAC)
 * - FilterService: Validate and resolve filters
 * - ChartConfigBuilderService: Build chart configs
 * - BatchExecutorService: Execute charts in parallel
 */

import { log, logTemplates } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import { DashboardLoaderService } from './dashboard-loader';
import { FilterService } from './filter-service';
import { ChartConfigBuilderService } from './chart-config-builder';
import { BatchExecutorService } from './batch-executor';
import { mapDashboardRenderResponse, buildEmptyDashboardResponse } from './mappers';
import type { DashboardUniversalFilters, DashboardRenderResponse } from './types';

/**
 * Dashboard Rendering Service
 *
 * Facade that orchestrates dashboard batch rendering across specialized services.
 */
export class DashboardRenderingService {
  private loader: DashboardLoaderService;
  private filterService: FilterService;
  private configBuilder: ChartConfigBuilderService;
  private executor: BatchExecutorService;

  constructor(private userContext: UserContext) {
    this.loader = new DashboardLoaderService(userContext);
    this.filterService = new FilterService(userContext);
    this.configBuilder = new ChartConfigBuilderService();
    this.executor = new BatchExecutorService(userContext);
  }

  /**
   * Render entire dashboard with all charts
   *
   * Process:
   * 1. Load dashboard + charts (RBAC enforced)
   * 2. Validate and resolve filters
   * 3. Build chart configurations
   * 4. Execute charts in parallel
   * 5. Transform and return
   *
   * @param dashboardId - Dashboard ID
   * @param universalFilters - Dashboard-level filters that override chart filters
   * @returns Batch response with all chart data
   */
  async renderDashboard(
    dashboardId: string,
    universalFilters: DashboardUniversalFilters
  ): Promise<DashboardRenderResponse> {
    const startTime = Date.now();
    const breakdown: Record<string, number> = {};

    try {
      log.info('Dashboard batch render initiated', {
        dashboardId,
        userId: this.userContext.user_id,
        operation: 'render_dashboard',
        hasUniversalFilters: Boolean(universalFilters && Object.keys(universalFilters).length > 0),
        organizationFilter: universalFilters.organizationId || null,
        component: 'dashboard-rendering',
      });

      // 1. Load dashboard + charts (RBAC enforced)
      const t1 = Date.now();
      const { dashboard, charts } = await this.loader.loadDashboardWithCharts(dashboardId);
      breakdown.load = Date.now() - t1;

      if (charts.length === 0) {
        return buildEmptyDashboardResponse(universalFilters);
      }

      // 2. Validate and resolve filters
      const t2 = Date.now();
      const resolvedFilters = await this.filterService.validateAndResolve(
        universalFilters,
        dashboard
      );
      breakdown.filterResolve = Date.now() - t2;

      // 3. Build chart configurations
      const t3 = Date.now();
      const chartConfigs = this.configBuilder.buildChartConfigs(charts, resolvedFilters);
      breakdown.configBuild = Date.now() - t3;

      // 4. Execute charts in parallel
      const t4 = Date.now();
      const executionResult = await this.executor.executeParallel(chartConfigs);
      breakdown.execution = Date.now() - t4;

      // 5. Transform and return
      const duration = Date.now() - startTime;
      const response = mapDashboardRenderResponse(executionResult, resolvedFilters, duration);

      // Log completion with template - includes breakdown for performance analysis
      const template = logTemplates.crud.read('dashboard', {
        resourceId: dashboardId,
        userId: this.userContext.user_id,
        duration,
        found: true,
        metadata: {
          chartsRendered: executionResult.results.length,
          cacheHits: executionResult.stats.cacheHits,
          cacheMisses: executionResult.stats.cacheMisses,
          breakdown,
        },
      });
      log.info(template.message, template.context);

      return response;
    } catch (error) {
      log.error('Dashboard render failed', error, {
        operation: 'render_dashboard',
        dashboardId,
        userId: this.userContext.user_id,
        component: 'dashboard-rendering',
      });
      throw error;
    }
  }
}
