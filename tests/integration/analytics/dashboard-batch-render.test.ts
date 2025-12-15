/**
 * Dashboard Batch Rendering API Integration Tests
 *
 * Phase 7: Tests for POST /api/admin/analytics/dashboard/[dashboardId]/render
 *
 * Tests:
 * - Batch rendering endpoint functionality
 * - Dashboard filter application
 * - Response structure validation
 * - Performance metrics
 * - Error handling
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '@/tests/setup/integration-setup';
import { eq, inArray } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '@/lib/db';
import { dashboard_charts } from '@/lib/db/analytics-schema';
import { chart_data_sources, dashboards } from '@/lib/db/schema';
import { log } from '@/lib/logger';
import {
  createDashboardRenderingService,
  type DashboardUniversalFilters,
} from '@/lib/services/dashboard-rendering';
import type { PermissionName, UserContext } from '@/lib/types/rbac';
import { assignRoleToUser, createTestRole } from '@/tests/factories';
import { createTestScope, type ScopedFactoryCollection } from '@/tests/factories/base';
import {
  type CommittedChart,
  type CommittedDashboard,
  type CommittedUser,
  createCommittedChart,
  createCommittedDashboard,
  createCommittedOrganization,
  createCommittedUser,
} from '@/tests/factories/committed';
import { rollbackTransaction } from '@/tests/helpers/db-helper';
import { buildUserContext, mapDatabaseRoleToRole } from '@/tests/helpers/rbac-helper';

describe('Dashboard Batch Rendering API', () => {
  let scope: ScopedFactoryCollection;
  let scopeId: string;
  let testUser: CommittedUser;
  let testOrganization: Awaited<ReturnType<typeof createCommittedOrganization>>;
  let testDashboard: CommittedDashboard;
  let testCharts: CommittedChart[];
  let userContext: UserContext;
  let serviceCreatedDashboardIds: string[] = [];

  beforeEach(async () => {
    // Create unique scope for this test
    scopeId = `dashboard-batch-render-${nanoid(8)}`;
    scope = createTestScope(scopeId);
    serviceCreatedDashboardIds = [];

    // Ensure data source #1 is active for chart rendering tests
    // This is needed because the test charts reference dataSourceId: 1
    await db
      .update(chart_data_sources)
      .set({ is_active: true })
      .where(eq(chart_data_sources.data_source_id, 1));

    // Create test organization
    testOrganization = await createCommittedOrganization({
      name: 'Test Organization',
      slug: `test-org-${Date.now()}`,
      scope: scopeId,
    });

    // Create test user with analytics permissions
    testUser = await createCommittedUser({ scope: scopeId });
    const role = await createTestRole({
      name: 'analytics_reader',
      permissions: [
        'dashboards:read:all' as PermissionName,
        'charts:read:all' as PermissionName, // Required for dashboard rendering to load charts
        'data-sources:read:all' as PermissionName, // Required for chart data orchestration
      ],
    });
    await assignRoleToUser(testUser, mapDatabaseRoleToRole(role));

    // Create test dashboard
    testDashboard = await createCommittedDashboard({
      dashboard_name: 'Test Analytics Dashboard',
      dashboard_description: 'Test dashboard for batch rendering',
      created_by: testUser.user_id,
      layout_config: {
        columns: 12,
        rowHeight: 150,
        margin: 10,
        filterConfig: {
          enabled: true,
          showDateRange: true,
          showOrganization: true,
        },
      },
      scope: scopeId,
    });

    // Create test charts
    testCharts = [];

    // Chart 1: Number chart
    const numberChart = await createCommittedChart({
      chart_name: 'Total Revenue',
      chart_type: 'number',
      created_by: testUser.user_id,
      data_source: {
        table: 'fact_charges',
        filters: [
          { field: 'measure', operator: 'eq', value: 'Total Charges' },
          { field: 'frequency', operator: 'eq', value: 'Monthly' },
        ],
      },
      chart_config: {
        dataSourceId: 1,
        aggregation: 'sum',
      },
      scope: scopeId,
    });
    testCharts.push(numberChart);

    // Chart 2: Bar chart
    const barChart = await createCommittedChart({
      chart_name: 'Charges by Provider',
      chart_type: 'bar',
      created_by: testUser.user_id,
      data_source: {
        table: 'fact_charges',
        filters: [
          { field: 'measure', operator: 'eq', value: 'Charges by Provider' },
          { field: 'frequency', operator: 'eq', value: 'Monthly' },
        ],
      },
      chart_config: {
        dataSourceId: 1,
        groupBy: 'provider_name',
      },
      scope: scopeId,
    });
    testCharts.push(barChart);

    // Associate charts with dashboard
    await db.insert(dashboard_charts).values([
      {
        dashboard_id: testDashboard.dashboard_id,
        chart_definition_id: numberChart.chart_definition_id,
        position_config: { x: 0, y: 0, w: 4, h: 2 },
      },
      {
        dashboard_id: testDashboard.dashboard_id,
        chart_definition_id: barChart.chart_definition_id,
        position_config: { x: 4, y: 0, w: 8, h: 4 },
      },
    ]);

    // Build proper user context with RBAC
    userContext = await buildUserContext(testUser, testOrganization.organization_id);

    log.info('Test setup complete', {
      dashboardId: testDashboard.dashboard_id,
      chartCount: testCharts.length,
      userId: testUser.user_id,
    });
  });

  afterEach(async () => {
    // Roll back test transaction first to release locks from transaction-based factories
    // (createTestRole, assignRoleToUser) before cleaning up committed data
    await rollbackTransaction();

    // Clean up service-created dashboards (not tracked by factories)
    if (serviceCreatedDashboardIds.length > 0) {
      // Delete dashboard_charts first (FK constraint)
      await db
        .delete(dashboard_charts)
        .where(inArray(dashboard_charts.dashboard_id, serviceCreatedDashboardIds));
      // Then delete dashboards
      await db
        .delete(dashboards)
        .where(inArray(dashboards.dashboard_id, serviceCreatedDashboardIds));
    }

    // Cleanup factory-created data (CommittedChartFactory now handles dashboard_charts cleanup)
    await scope.cleanup();

    log.info('Test cleanup complete', { scope: scopeId });
  });

  describe('Basic Batch Rendering', () => {
    it('should render dashboard with all charts', async () => {
      const dashboardRenderingService = createDashboardRenderingService(userContext);

      const result = await dashboardRenderingService.renderDashboard(
        testDashboard.dashboard_id,
        {}
      );

      // Verify response structure
      expect(result).toBeDefined();
      expect(result.charts).toBeDefined();
      expect(result.metadata).toBeDefined();

      // Verify metadata
      expect(result.metadata.chartsRendered).toBeGreaterThan(0);
      expect(result.metadata.queriesExecuted).toBeGreaterThanOrEqual(0);
      expect(result.metadata.parallelExecution).toBe(true);
      expect(result.metadata.dashboardFiltersApplied).toBeInstanceOf(Array);

      // Verify charts object exists
      expect(typeof result.charts).toBe('object');

      log.info('Batch rendering test passed', {
        chartsRendered: result.metadata.chartsRendered,
        totalQueryTime: result.metadata.totalQueryTime,
        cacheHits: result.metadata.cacheHits,
      });
    });

    it('should include performance metrics', async () => {
      const dashboardRenderingService = createDashboardRenderingService(userContext);

      const result = await dashboardRenderingService.renderDashboard(
        testDashboard.dashboard_id,
        {}
      );

      // Verify performance metrics exist
      expect(result.metadata.totalQueryTime).toBeGreaterThanOrEqual(0);
      expect(result.metadata.cacheHits).toBeGreaterThanOrEqual(0);
      expect(result.metadata.cacheMisses).toBeGreaterThanOrEqual(0);
      expect(result.metadata.queriesExecuted).toBeGreaterThanOrEqual(0);

      // Verify cache hit rate calculation
      const cacheHitRate =
        result.metadata.queriesExecuted > 0
          ? (result.metadata.cacheHits / result.metadata.queriesExecuted) * 100
          : 0;

      expect(cacheHitRate).toBeGreaterThanOrEqual(0);
      expect(cacheHitRate).toBeLessThanOrEqual(100);

      log.info('Performance metrics test passed', {
        cacheHitRate: `${cacheHitRate.toFixed(1)}%`,
        totalQueryTime: result.metadata.totalQueryTime,
      });
    });
  });

  describe('Dashboard Filters', () => {
    it('should apply date range filters', async () => {
      const dashboardRenderingService = createDashboardRenderingService(userContext);

      const universalFilters: DashboardUniversalFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        dateRangePreset: 'custom',
      };

      const result = await dashboardRenderingService.renderDashboard(
        testDashboard.dashboard_id,
        universalFilters
      );

      expect(result).toBeDefined();
      expect(result.metadata.dashboardFiltersApplied).toContain('dateRange');

      log.info('Date range filter test passed', {
        filtersApplied: result.metadata.dashboardFiltersApplied,
      });
    });

    it('should apply organization filters', async () => {
      const dashboardRenderingService = createDashboardRenderingService(userContext);

      const universalFilters: DashboardUniversalFilters = {
        organizationId: testOrganization.organization_id,
      };

      const result = await dashboardRenderingService.renderDashboard(
        testDashboard.dashboard_id,
        universalFilters
      );

      expect(result).toBeDefined();
      expect(result.metadata.dashboardFiltersApplied).toContain('organization');

      log.info('Organization filter test passed', {
        organizationId: testOrganization.organization_id,
        filtersApplied: result.metadata.dashboardFiltersApplied,
      });
    });

    it('should apply multiple filters simultaneously', async () => {
      const dashboardRenderingService = createDashboardRenderingService(userContext);

      const universalFilters: DashboardUniversalFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        organizationId: testOrganization.organization_id,
      };

      const result = await dashboardRenderingService.renderDashboard(
        testDashboard.dashboard_id,
        universalFilters
      );

      expect(result).toBeDefined();
      expect(result.metadata.dashboardFiltersApplied.length).toBeGreaterThan(0);
      expect(result.metadata.dashboardFiltersApplied).toContain('dateRange');
      expect(result.metadata.dashboardFiltersApplied).toContain('organization');

      log.info('Multiple filters test passed', {
        filtersApplied: result.metadata.dashboardFiltersApplied,
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle dashboard not found', async () => {
      const dashboardRenderingService = createDashboardRenderingService(userContext);
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      await expect(
        dashboardRenderingService.renderDashboard(nonExistentId, {})
      ).rejects.toThrow(/not found/i);

      log.info('Dashboard not found test passed');
    });

    it('should handle empty dashboard (no charts)', async () => {
      // Create dashboard with no charts
      const emptyDashboard = await createCommittedDashboard({
        dashboard_name: 'Empty Dashboard',
        created_by: testUser.user_id,
        scope: scopeId,
      });

      const dashboardRenderingService = createDashboardRenderingService(userContext);

      const result = await dashboardRenderingService.renderDashboard(
        emptyDashboard.dashboard_id,
        {}
      );

      expect(result).toBeDefined();
      expect(result.metadata.chartsRendered).toBe(0);
      expect(Object.keys(result.charts).length).toBe(0);

      log.info('Empty dashboard test passed');
    });
  });

  describe('Performance', () => {
    it('should render dashboard in under 5 seconds', async () => {
      const dashboardRenderingService = createDashboardRenderingService(userContext);
      const startTime = Date.now();

      const result = await dashboardRenderingService.renderDashboard(
        testDashboard.dashboard_id,
        {}
      );

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000); // 5 second threshold
      expect(result.metadata.totalQueryTime).toBeGreaterThan(0);

      log.info('Performance test passed', {
        totalDuration: duration,
        queryTime: result.metadata.totalQueryTime,
      });
    });

    it('should execute queries in parallel', async () => {
      const dashboardRenderingService = createDashboardRenderingService(userContext);

      const result = await dashboardRenderingService.renderDashboard(
        testDashboard.dashboard_id,
        {}
      );

      expect(result.metadata.parallelExecution).toBe(true);

      log.info('Parallel execution test passed');
    });
  });


  describe('Table Chart Support (Phase 7)', () => {
    it('should render table charts in batch mode', async () => {
      // Create a table chart
      const tableChart = await createCommittedChart({
        chart_name: 'Provider Performance Table',
        chart_type: 'table',
        created_by: testUser.user_id,
        data_source: {
          table: 'fact_charges',
          filters: [
            { field: 'measure', operator: 'eq', value: 'Provider Performance' },
            { field: 'frequency', operator: 'eq', value: 'Monthly' },
          ],
        },
        chart_config: {
          dataSourceId: 1,
        },
        scope: scopeId,
      });

      const dashboard = await createCommittedDashboard({
        dashboard_name: 'Table Chart Dashboard',
        created_by: testUser.user_id,
        scope: scopeId,
      });

      await db.insert(dashboard_charts).values({
        dashboard_id: dashboard.dashboard_id,
        chart_definition_id: tableChart.chart_definition_id,
        position_config: { x: 0, y: 0, w: 12, h: 4 },
      });

      const dashboardRenderingService = createDashboardRenderingService(userContext);

      const result = await dashboardRenderingService.renderDashboard(
        dashboard.dashboard_id,
        {}
      );

      // Phase 7: Verify table chart was rendered
      expect(result).toBeDefined();
      expect(result.metadata.chartsRendered).toBeGreaterThan(0);

      // Check that table chart is included in results
      const chartResults = Object.values(result.charts);
      expect(chartResults.length).toBeGreaterThan(0);

      // Table charts should have columns and formattedData
      const tableResult = chartResults[0];
      if (tableResult) {
        expect(tableResult.chartData).toBeDefined();
        expect(tableResult.rawData).toBeDefined();
      }

      log.info('Table chart batch rendering test passed', {
        chartType: 'table',
        chartsRendered: result.metadata.chartsRendered,
      });
    });

    it('should include table chart metadata (columns and formatted data)', async () => {
      const tableChart = await createCommittedChart({
        chart_name: 'Financial Summary Table',
        chart_type: 'table',
        created_by: testUser.user_id,
        data_source: {
          table: 'fact_charges',
          filters: [
            { field: 'measure', operator: 'eq', value: 'Financial Summary' },
            { field: 'frequency', operator: 'eq', value: 'Monthly' },
          ],
        },
        chart_config: {
          dataSourceId: 1,
        },
        scope: scopeId,
      });

      const dashboard = await createCommittedDashboard({
        dashboard_name: 'Table Metadata Dashboard',
        created_by: testUser.user_id,
        scope: scopeId,
      });

      await db.insert(dashboard_charts).values({
        dashboard_id: dashboard.dashboard_id,
        chart_definition_id: tableChart.chart_definition_id,
        position_config: { x: 0, y: 0, w: 12, h: 6 },
      });

      const dashboardRenderingService = createDashboardRenderingService(userContext);

      const result = await dashboardRenderingService.renderDashboard(
        dashboard.dashboard_id,
        {}
      );

      // Phase 7: Verify table-specific metadata is included
      expect(result).toBeDefined();
      const chartResults = Object.values(result.charts);
      expect(chartResults.length).toBeGreaterThan(0);

      const tableResult = chartResults[0];
      if (tableResult) {
        // Table charts should have these properties
        expect(tableResult.rawData).toBeDefined();
        expect(tableResult.metadata).toBeDefined();

        // Columns metadata may be present for table charts
        if (tableResult.columns) {
          expect(Array.isArray(tableResult.columns)).toBe(true);
        }
      }

      log.info('Table chart metadata test passed', {
        hasRawData: !!tableResult?.rawData,
        hasMetadata: !!tableResult?.metadata,
        hasColumns: !!tableResult?.columns,
      });
    });

    it('should render mixed dashboard with table and non-table charts', async () => {
      // Create mixed chart types including table
      const mixedCharts = await Promise.all([
        createCommittedChart({
          chart_name: 'Revenue Line Chart',
          chart_type: 'line',
          created_by: testUser.user_id,
          data_source: {
            table: 'fact_charges',
            filters: [
              { field: 'measure', operator: 'eq', value: 'Revenue' },
              { field: 'frequency', operator: 'eq', value: 'Monthly' },
            ],
          },
          chart_config: {
            dataSourceId: 1,
          },
          scope: scopeId,
        }),
        createCommittedChart({
          chart_name: 'Performance Table',
          chart_type: 'table',
          created_by: testUser.user_id,
          data_source: {
            table: 'fact_charges',
            filters: [
              { field: 'measure', operator: 'eq', value: 'Performance' },
              { field: 'frequency', operator: 'eq', value: 'Monthly' },
            ],
          },
          chart_config: {
            dataSourceId: 1,
          },
          scope: scopeId,
        }),
        createCommittedChart({
          chart_name: 'Total Bar Chart',
          chart_type: 'bar',
          created_by: testUser.user_id,
          data_source: {
            table: 'fact_charges',
            filters: [
              { field: 'measure', operator: 'eq', value: 'Total' },
              { field: 'frequency', operator: 'eq', value: 'Monthly' },
            ],
          },
          chart_config: {
            dataSourceId: 1,
          },
          scope: scopeId,
        }),
      ]);

      const dashboard = await createCommittedDashboard({
        dashboard_name: 'Mixed Charts Dashboard',
        created_by: testUser.user_id,
        scope: scopeId,
      });

      await db.insert(dashboard_charts).values(
        mixedCharts.map((chart, idx) => ({
          dashboard_id: dashboard.dashboard_id,
          chart_definition_id: chart.chart_definition_id,
          position_config: { x: 0, y: idx * 4, w: 12, h: 4 },
        }))
      );

      const dashboardRenderingService = createDashboardRenderingService(userContext);

      const result = await dashboardRenderingService.renderDashboard(
        dashboard.dashboard_id,
        {}
      );

      // Phase 7: Verify all chart types render together
      expect(result).toBeDefined();
      expect(result.metadata.chartsRendered).toBe(3);
      expect(Object.keys(result.charts).length).toBe(3);

      // All charts should have results
      const chartResults = Object.values(result.charts);
      expect(chartResults.length).toBe(3);

      chartResults.forEach((chartResult) => {
        expect(chartResult).toBeDefined();
        if (chartResult) {
          expect(chartResult.chartData).toBeDefined();
          expect(chartResult.rawData).toBeDefined();
        }
      });

      log.info('Mixed chart types dashboard test passed', {
        totalCharts: 3,
        chartTypes: ['line', 'table', 'bar'],
        chartsRendered: result.metadata.chartsRendered,
        message: 'Table charts render alongside other chart types',
      });
    });

  });
});
