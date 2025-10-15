/**
 * Dashboard Renderer Service
 *
 * Phase 7: Dashboard Batch Rendering + Universal Filters
 *
 * Orchestrates batch rendering of all charts in a dashboard with:
 * - Parallel chart execution
 * - Dashboard-level universal filter merging
 * - Query deduplication
 * - Aggregate performance metrics
 *
 * Features:
 * - Single API call for entire dashboard
 * - Universal filters override chart filters
 * - Parallel query execution (10x faster than sequential)
 * - Comprehensive error handling
 * - Performance tracking
 */

import { log } from '@/lib/logger';
import type { ChartData } from '@/lib/types/analytics';
import type { UserContext } from '@/lib/types/rbac';
import { chartDataOrchestrator } from './chart-data-orchestrator';
import { DashboardQueryCache, generateQueryHash } from './dashboard-query-cache';
import { createOrganizationAccessService } from './organization-access-service';
import { organizationHierarchyService } from './organization-hierarchy-service';
import { createRBACChartsService } from './rbac-charts-service';
import { createRBACDashboardsService } from './rbac-dashboards-service';

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
    // FIX #6: Add these for proper chart rendering
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

    // Phase 7: Query deduplication metrics
    deduplication: {
      enabled: boolean;
      queriesDeduped: number; // How many charts reused queries
      uniqueQueries: number; // How many unique queries executed
      deduplicationRate: number; // Percentage of queries saved
    };
  };
}

/**
 * Dashboard Renderer Service
 *
 * Coordinates batch rendering of all charts in a dashboard with
 * dashboard-level universal filters and parallel execution.
 */
export class DashboardRenderer {
  /**
   * Render entire dashboard with all charts
   *
   * @param dashboardId - Dashboard ID
   * @param universalFilters - Dashboard-level filters that override chart filters
   * @param userContext - User context for RBAC
   * @returns Batch response with all chart data
   */
  async renderDashboard(
    dashboardId: string,
    universalFilters: DashboardUniversalFilters,
    userContext: UserContext
  ): Promise<DashboardRenderResponse> {
    const startTime = Date.now();

    // Phase 7: Query deduplication cache (per-render scope)
    const queryCache = new DashboardQueryCache();

    try {
      log.info('Dashboard batch render initiated', {
        dashboardId,
        userId: userContext.user_id,
        hasUniversalFilters: Boolean(universalFilters && Object.keys(universalFilters).length > 0),
        organizationFilter: universalFilters.organizationId || null,
        queryDeduplicationEnabled: true,
      });

      // 1. Load dashboard definition with RBAC
      const dashboardsService = createRBACDashboardsService(userContext);
      const dashboard = await dashboardsService.getDashboardById(dashboardId);

      if (!dashboard) {
        throw new Error(`Dashboard not found: ${dashboardId}`);
      }

      // NEW: Validate and process organization filter (if present)
      if (universalFilters.organizationId) {
        // Validate user can access this organization
        await this.validateOrganizationFilterAccess(universalFilters.organizationId, userContext);

        // Convert organization filter to practice_uids (with hierarchy)
        universalFilters.practiceUids = await this.getOrganizationPracticeUids(
          universalFilters.organizationId
        );

        log.info('Dashboard organization filter processed', {
          dashboardId,
          organizationId: universalFilters.organizationId || null,
          practiceUidCount: universalFilters.practiceUids?.length || 0,
          practiceUids: universalFilters.practiceUids || [],
        });
      }

      // 2. Load chart definitions for THIS dashboard only
      // FIX #1: Use dashboard.charts (filtered to this dashboard) instead of ALL charts
      const dashboardCharts = dashboard.charts || [];

      if (dashboardCharts.length === 0) {
        log.warn('Dashboard has no charts', { dashboardId });
        return {
          charts: {},
          metadata: {
            totalQueryTime: 0,
            cacheHits: 0,
            cacheMisses: 0,
            queriesExecuted: 0,
            chartsRendered: 0,
            dashboardFiltersApplied: this.getAppliedFilterNames(universalFilters),
            parallelExecution: false,
            deduplication: {
              enabled: false,
              queriesDeduped: 0,
              uniqueQueries: 0,
              deduplicationRate: 0,
            },
          },
        };
      }

      // FIX #2: Load full chart definitions (dashboard.charts has minimal info)
      const chartsService = createRBACChartsService(userContext);
      const fullChartDefsPromises = dashboardCharts.map((dashboardChart) =>
        chartsService.getChartById(dashboardChart.chart_definition_id)
      );

      const fullChartDefs = await Promise.all(fullChartDefsPromises);

      // Filter out nulls and inactive charts
      const validCharts = fullChartDefs.filter((chart) => chart?.is_active);

      if (validCharts.length === 0) {
        log.warn('Dashboard has no active/accessible charts', { dashboardId });
        return {
          charts: {},
          metadata: {
            totalQueryTime: 0,
            cacheHits: 0,
            cacheMisses: 0,
            queriesExecuted: 0,
            chartsRendered: 0,
            dashboardFiltersApplied: this.getAppliedFilterNames(universalFilters),
            parallelExecution: false,
            deduplication: {
              enabled: false,
              queriesDeduped: 0,
              uniqueQueries: 0,
              deduplicationRate: 0,
            },
          },
        };
      }

      log.info('Dashboard charts loaded', {
        dashboardId,
        totalCharts: dashboardCharts.length,
        validCharts: validCharts.length,
        chartTypes: validCharts.map((c) => c?.chart_type || 'unknown'),
      });

      // 4. Render all charts in parallel with universal filters
      const renderPromises = validCharts.map(async (chart) => {
        // Null guard
        if (!chart) {
          return { chartId: '', result: null };
        }

        const chartDef = chart; // Type guard: chart is not null after this point

        try {
          // Phase 7: Table charts now supported in batch rendering
          log.info('Processing chart in batch', {
            chartId: chartDef.chart_definition_id,
            chartName: chartDef.chart_name,
            chartType: chartDef.chart_type,
            batchSupported: true,
          });

          // FIX #3: Extract filters from data_source (like dashboard-view does)
          interface DataSourceFilter {
            field: string;
            operator?: string;
            value?: unknown;
          }

          const dataSource =
            (chartDef.data_source as {
              filters?: DataSourceFilter[];
              advancedFilters?: unknown[];
            }) || {};
          const dataSourceFilters = dataSource.filters || [];

          const measureFilter = dataSourceFilters.find((f) => f.field === 'measure');
          const frequencyFilter = dataSourceFilters.find((f) => f.field === 'frequency');
          const practiceFilter = dataSourceFilters.find((f) => f.field === 'practice_uid');
          const startDateFilter = dataSourceFilters.find(
            (f) => f.field === 'date_index' && f.operator === 'gte'
          );
          const endDateFilter = dataSourceFilters.find(
            (f) => f.field === 'date_index' && f.operator === 'lte'
          );

          // FIX #4: Build runtimeFilters from data_source filters
          const runtimeFilters: Record<string, unknown> = {};

          // Extract from data_source.filters
          if (measureFilter?.value) runtimeFilters.measure = measureFilter.value;
          if (frequencyFilter?.value) runtimeFilters.frequency = frequencyFilter.value;
          if (practiceFilter?.value) runtimeFilters.practiceUid = practiceFilter.value;
          if (startDateFilter?.value) runtimeFilters.startDate = startDateFilter.value;
          if (endDateFilter?.value) runtimeFilters.endDate = endDateFilter.value;

          // Extract advancedFilters if present
          if (dataSource.advancedFilters && Array.isArray(dataSource.advancedFilters)) {
            runtimeFilters.advancedFilters = dataSource.advancedFilters;
          }

          // Universal filters override chart-level filters (dashboard filters win)
          if (universalFilters.startDate) runtimeFilters.startDate = universalFilters.startDate;
          if (universalFilters.endDate) runtimeFilters.endDate = universalFilters.endDate;
          // SECURITY-CRITICAL: Pass empty arrays through (fail-closed for orgs with no practices)
          if (universalFilters.practiceUids !== undefined) {
            runtimeFilters.practiceUids = universalFilters.practiceUids;
          }

          // Merge chart_config with universal filters
          const mergedChartConfig = this.mergeFilters(
            chartDef.chart_config as Record<string, unknown>,
            universalFilters
          );

          // FIX: Flatten nested series.* fields (handlers expect top-level)
          const chartConfigTyped = chartDef.chart_config as {
            series?: { groupBy?: string; colorPalette?: string };
            groupBy?: string;
            colorPalette?: string;
            dualAxisConfig?: unknown;
            aggregation?: string;
            target?: number;
            stackingMode?: string;
            dataSourceId?: number;
          };

          // Build final config with flattened fields
          const finalChartConfig: Record<string, unknown> = {
            ...mergedChartConfig,
            chartType: chartDef.chart_type,
            dataSourceId: chartConfigTyped.dataSourceId || 0,
          };

          // Flatten series.groupBy to top-level groupBy (critical for progress/bar charts)
          // EXCEPT for number charts which don't support groupBy
          if (chartDef.chart_type !== 'number' && chartConfigTyped.series?.groupBy) {
            finalChartConfig.groupBy = chartConfigTyped.series.groupBy;
          }

          // Flatten series.colorPalette to top-level colorPalette
          if (chartConfigTyped.series?.colorPalette) {
            finalChartConfig.colorPalette = chartConfigTyped.series.colorPalette;
          }

          // Ensure critical chart-type-specific fields are present
          if (chartDef.chart_type === 'dual-axis' && chartConfigTyped.dualAxisConfig) {
            finalChartConfig.dualAxisConfig = chartConfigTyped.dualAxisConfig;
          }

          if (chartDef.chart_type === 'progress-bar') {
            if (chartConfigTyped.aggregation)
              finalChartConfig.aggregation = chartConfigTyped.aggregation;
            if (chartConfigTyped.target !== undefined)
              finalChartConfig.target = chartConfigTyped.target;
          }

          if (chartConfigTyped.stackingMode) {
            finalChartConfig.stackingMode = chartConfigTyped.stackingMode;
          }

          // CRITICAL: Multi-series support - field stored as 'seriesConfigs' but passed as 'multipleSeries'
          const seriesConfigs = (chartDef.chart_config as { seriesConfigs?: unknown[] })
            ?.seriesConfigs;
          if (seriesConfigs && Array.isArray(seriesConfigs) && seriesConfigs.length > 0) {
            finalChartConfig.multipleSeries = seriesConfigs;
          }

          // Debug logging
          log.info('Batch chart config prepared', {
            chartId: chartDef.chart_definition_id,
            chartType: chartDef.chart_type,
            chartName: chartDef.chart_name,
            hasGroupBy: !!finalChartConfig.groupBy,
            groupByValue: finalChartConfig.groupBy,
            hasDualAxisConfig: !!finalChartConfig.dualAxisConfig,
            hasAggregation: !!finalChartConfig.aggregation,
            runtimeFilterKeys: Object.keys(runtimeFilters),
          });

          // Phase 7: Generate query hash for deduplication
          const queryHash = generateQueryHash(finalChartConfig, runtimeFilters);

          // Phase 7: Execute query with deduplication
          // Cache stores full orchestrator results (with chartData, rawData, metadata)
          const result = await queryCache.get(queryHash, async () => {
            // Execute chart via orchestrator - returns full OrchestrationResult
            return await chartDataOrchestrator.orchestrate(
              {
                chartConfig: finalChartConfig as typeof finalChartConfig & {
                  chartType: string;
                  dataSourceId: number;
                },
                runtimeFilters, // FIX #4: Pass extracted filters to orchestrator
              },
              userContext
            );
          });

          // FIX #6: Include measure/frequency/groupBy in metadata
          const groupByValue =
            (chartDef.chart_config as { groupBy?: string; series?: { groupBy?: string } })
              ?.groupBy ||
            (chartDef.chart_config as { series?: { groupBy?: string } })?.series?.groupBy;

          const chartResult: ChartRenderResult = {
            chartData: result.chartData,
            rawData: result.rawData,
            metadata: {
              chartType: result.metadata.chartType,
              dataSourceId: result.metadata.dataSourceId,
              transformedAt: new Date().toISOString(),
              queryTimeMs: result.metadata.queryTimeMs,
              cacheHit: result.metadata.cacheHit,
              recordCount: result.metadata.recordCount,
              transformDuration: 0,
            },
          };

          // FIX #6: Add optional fields only if they exist (exactOptionalPropertyTypes)
          const measureValue = measureFilter?.value?.toString();
          const frequencyValue = frequencyFilter?.value?.toString();

          if (measureValue) chartResult.metadata.measure = measureValue;
          if (frequencyValue) chartResult.metadata.frequency = frequencyValue;
          if (groupByValue) chartResult.metadata.groupBy = groupByValue;

          // Include columns/formattedData if present (from result)
          if (result.columns) chartResult.columns = result.columns;
          if (result.formattedData) chartResult.formattedData = result.formattedData;

          return {
            chartId: chartDef.chart_definition_id,
            result: chartResult,
          };
        } catch (error) {
          log.error('Chart render failed in batch', error, {
            chartId: chartDef.chart_definition_id,
            chartName: chartDef.chart_name,
          });

          // Return null for failed charts (partial success)
          return {
            chartId: chartDef.chart_definition_id,
            result: null,
          };
        }
      });

      // 5. Execute all chart renders in parallel
      const parallelStartTime = Date.now();
      const results = await Promise.all(renderPromises);
      const parallelDuration = Date.now() - parallelStartTime;

      // 6. Aggregate results
      const charts: Record<string, ChartRenderResult> = {};
      let cacheHits = 0;
      let cacheMisses = 0;
      let totalQueryTime = 0;

      for (const { chartId, result } of results) {
        if (result) {
          charts[chartId] = result;
          if (result.metadata.cacheHit) {
            cacheHits++;
          } else {
            cacheMisses++;
          }
          totalQueryTime += result.metadata.queryTimeMs;
        }
      }

      const duration = Date.now() - startTime;

      // Phase 7: Get deduplication statistics
      const dedupStats = queryCache.getStats();

      log.info('Dashboard batch render completed', {
        dashboardId,
        chartsRendered: Object.keys(charts).length,
        cacheHits,
        cacheMisses,
        totalQueryTime,
        parallelDuration,
        duration,
        // Phase 7: Deduplication stats
        queryDeduplication: {
          uniqueQueries: dedupStats.uniqueQueries,
          queriesDeduped: dedupStats.hits,
          deduplicationRate: `${dedupStats.deduplicationRate}%`,
          totalCharts: validCharts.length,
          queriesSaved: dedupStats.hits,
        },
      });

      return {
        charts,
        metadata: {
          totalQueryTime,
          cacheHits,
          cacheMisses,
          queriesExecuted: cacheMisses, // Only cache misses hit DB
          chartsRendered: Object.keys(charts).length,
          dashboardFiltersApplied: this.getAppliedFilterNames(universalFilters),
          parallelExecution: true,

          // Phase 7: Query deduplication metrics
          deduplication: {
            enabled: true,
            queriesDeduped: dedupStats.hits,
            uniqueQueries: dedupStats.uniqueQueries,
            deduplicationRate: dedupStats.deduplicationRate,
          },
        },
      };
    } catch (error) {
      log.error('Dashboard batch render failed', error, {
        dashboardId,
        userId: userContext.user_id,
      });

      throw error;
    } finally {
      // Phase 7: Clear query cache after render completes
      queryCache.clear();
    }
  }

  /**
   * Validate user can access the selected organization
   *
   * Security Rules:
   * - Super admins (analytics:read:all) can filter by any organization
   * - Org users (analytics:read:organization) can only filter by their own organizations
   * - Provider users (analytics:read:own) cannot use organization filter
   * - No analytics permission = cannot use org filter
   *
   * @param organizationId - Organization ID from dashboard filter
   * @param userContext - User context for permission checking
   * @throws Error if user cannot access this organization
   */
  private async validateOrganizationFilterAccess(
    organizationId: string,
    userContext: UserContext
  ): Promise<void> {
    const accessService = createOrganizationAccessService(userContext);
    const accessInfo = await accessService.getAccessiblePracticeUids();

    // Super admins can filter by any organization
    if (accessInfo.scope === 'all') {
      log.info('Super admin can filter by any organization', {
        userId: userContext.user_id,
        requestedOrganizationId: organizationId,
        permissionScope: 'all',
      });
      return;
    }

    // Provider users cannot use organization filter
    if (accessInfo.scope === 'own') {
      log.security('Provider user attempted to use organization filter - denied', 'high', {
        userId: userContext.user_id,
        requestedOrganizationId: organizationId,
        blocked: true,
        reason: 'provider_cannot_filter_by_org',
      });

      throw new Error(
        'Access denied: Provider-level users cannot filter by organization. You can only see your own provider data.'
      );
    }

    // Organization users can only filter by their own organizations
    if (accessInfo.scope === 'organization') {
      const canAccess = userContext.organizations.some(
        (org) => org.organization_id === organizationId
      );

      if (!canAccess) {
        log.security('Organization filter access denied', 'high', {
          userId: userContext.user_id,
          requestedOrganizationId: organizationId,
          userOrganizationIds: userContext.organizations.map((o) => o.organization_id),
          blocked: true,
          reason: 'user_not_member_of_org',
        });

        throw new Error(
          `Access denied: You do not have permission to filter by organization ${organizationId}. You can only filter by organizations you belong to.`
        );
      }

      log.info('Organization filter access granted', {
        userId: userContext.user_id,
        requestedOrganizationId: organizationId,
        verified: true,
      });
    }

    // No analytics permission
    if (accessInfo.scope === 'none') {
      log.security(
        'User without analytics permission attempted to use organization filter - denied',
        'medium',
        {
          userId: userContext.user_id,
          requestedOrganizationId: organizationId,
          blocked: true,
          reason: 'no_analytics_permission',
        }
      );

      throw new Error('Access denied: You do not have analytics permissions.');
    }
  }

  /**
   * Get practice_uids for a specific organization (with hierarchy)
   *
   * Converts selected organizationId to array of practice_uid values.
   * Includes practice_uids from child organizations (recursive).
   *
   * @param organizationId - Organization ID from dashboard filter
   * @returns Array of practice_uid values (with hierarchy)
   */
  private async getOrganizationPracticeUids(organizationId: string): Promise<number[]> {
    // Get all organizations in hierarchy (org + descendants)
    const allOrganizations = await organizationHierarchyService.getAllOrganizations();

    const hierarchyPracticeUids = await organizationHierarchyService.getHierarchyPracticeUids(
      organizationId,
      allOrganizations
    );

    log.info('Organization practice_uids resolved for dashboard filter', {
      organizationId,
      practiceUidCount: hierarchyPracticeUids.length,
      practiceUids: hierarchyPracticeUids,
      includesHierarchy: hierarchyPracticeUids.length > 0,
    });

    return hierarchyPracticeUids;
  }

  /**
   * Merge dashboard universal filters with chart configuration
   * Dashboard filters take precedence over chart filters
   *
   * @param chartConfig - Chart configuration from definition
   * @param universalFilters - Dashboard-level filters
   * @returns Merged configuration
   */
  private mergeFilters(
    chartConfig: Record<string, unknown>,
    universalFilters: DashboardUniversalFilters
  ): Record<string, unknown> {
    const merged = { ...chartConfig };

    // Dashboard filters override chart filters (if present)
    if (universalFilters.startDate !== null && universalFilters.startDate !== undefined) {
      merged.startDate = universalFilters.startDate;
    }

    if (universalFilters.endDate !== null && universalFilters.endDate !== undefined) {
      merged.endDate = universalFilters.endDate;
    }

    if (
      universalFilters.dateRangePreset !== null &&
      universalFilters.dateRangePreset !== undefined
    ) {
      merged.dateRangePreset = universalFilters.dateRangePreset;
    }

    if (universalFilters.organizationId !== null && universalFilters.organizationId !== undefined) {
      merged.organizationId = universalFilters.organizationId;
    }

    // NEW: Pass through practice_uids (from organization filter with hierarchy)
    if (universalFilters.practiceUids !== null && universalFilters.practiceUids !== undefined) {
      merged.practiceUids = universalFilters.practiceUids;
    }

    if (universalFilters.providerName !== null && universalFilters.providerName !== undefined) {
      merged.providerName = universalFilters.providerName;
    }

    return merged;
  }

  /**
   * Get names of applied dashboard filters for logging
   */
  private getAppliedFilterNames(filters: DashboardUniversalFilters): string[] {
    const applied: string[] = [];

    if (filters.startDate || filters.endDate || filters.dateRangePreset) {
      applied.push('dateRange');
    }
    if (filters.organizationId) applied.push('organization');
    if (filters.practiceUids && filters.practiceUids.length > 0) applied.push('practice');
    if (filters.providerName) applied.push('provider');

    return applied;
  }
}

// Export singleton instance
export const dashboardRenderer = new DashboardRenderer();
