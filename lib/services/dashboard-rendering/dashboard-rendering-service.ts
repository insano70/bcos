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
 * - BatchExecutorService: Execute in parallel with deduplication
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
   * 4. Execute in parallel with deduplication
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

    try {
      log.info('Dashboard batch render initiated', {
        dashboardId,
        userId: this.userContext.user_id,
        operation: 'render_dashboard',
        hasUniversalFilters: Boolean(universalFilters && Object.keys(universalFilters).length > 0),
        organizationFilter: universalFilters.organizationId || null,
        queryDeduplicationEnabled: true,
        component: 'dashboard-rendering',
      });

      // 1. Load dashboard + charts (RBAC enforced)
      const { dashboard, charts } = await this.loader.loadDashboardWithCharts(dashboardId);

      if (charts.length === 0) {
        return buildEmptyDashboardResponse(universalFilters);
      }

      // 2. Validate and resolve filters
      const resolvedFilters = await this.filterService.validateAndResolve(
        universalFilters,
        dashboard
      );

      // 3. Build chart configurations
      const chartConfigs = this.configBuilder.buildChartConfigs(charts, resolvedFilters);

      // 4. Execute in parallel with deduplication
      const executionResult = await this.executor.executeParallel(chartConfigs);

      // 5. Transform and return
      const duration = Date.now() - startTime;
      const response = mapDashboardRenderResponse(executionResult, resolvedFilters, duration);

      // Log completion with template
      const template = logTemplates.crud.read('dashboard', {
        resourceId: dashboardId,
        userId: this.userContext.user_id,
        duration,
        found: true,
        metadata: {
          chartsRendered: executionResult.results.length,
          cacheHits: executionResult.stats.cacheHits,
          deduplicationRate: executionResult.stats.deduplicationStats.deduplicationRate,
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
