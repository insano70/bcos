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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '@/tests/setup/integration-setup';
import {
  createCommittedUser,
  createCommittedDashboard,
  createCommittedChart,
  createCommittedOrganization,
  type CommittedUser,
  type CommittedDashboard,
  type CommittedChart,
} from '@/tests/factories/committed';
import { createTestRole, assignRoleToUser } from '@/tests/factories';
import { mapDatabaseRoleToRole, buildUserContext } from '@/tests/helpers/rbac-helper';
import { db } from '@/lib/db';
import { dashboards } from '@/lib/db/schema';
import { dashboard_charts } from '@/lib/db/analytics-schema';
import { DashboardRenderer, type DashboardUniversalFilters } from '@/lib/services/dashboard-renderer';
import type { UserContext, PermissionName } from '@/lib/types/rbac';
import { log } from '@/lib/logger';
import { createTestScope, type ScopedFactoryCollection } from '@/tests/factories/base';
import { nanoid } from 'nanoid';
import { inArray } from 'drizzle-orm';

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
      permissions: ['analytics:read:all' as PermissionName],
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
        filters: [{ field: 'measure', operator: 'eq', value: 'Total Charges' }],
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
        filters: [{ field: 'measure', operator: 'eq', value: 'Charges by Provider' }],
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
    userContext = await buildUserContext(
      testUser,
      testOrganization.organization_id
    );

    log.info('Test setup complete', {
      dashboardId: testDashboard.dashboard_id,
      chartCount: testCharts.length,
      userId: testUser.user_id,
    });
  });

  afterEach(async () => {
    // CRITICAL: Clean up service-created dashboards FIRST
    if (serviceCreatedDashboardIds.length > 0) {
      await db.delete(dashboards)
        .where(inArray(dashboards.dashboard_id, serviceCreatedDashboardIds));
    }

    // Then cleanup factory-created data
    await scope.cleanup();
    
    log.info('Test cleanup complete', { scope: scopeId });
  });

  describe('Basic Batch Rendering', () => {
    it('should render dashboard with all charts', async () => {
      const dashboardRenderer = new DashboardRenderer();

      const result = await dashboardRenderer.renderDashboard(
        testDashboard.dashboard_id,
        {},
        userContext
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
      const dashboardRenderer = new DashboardRenderer();

      const result = await dashboardRenderer.renderDashboard(
        testDashboard.dashboard_id,
        {},
        userContext
      );

      // Verify performance metrics exist
      expect(result.metadata.totalQueryTime).toBeGreaterThanOrEqual(0);
      expect(result.metadata.cacheHits).toBeGreaterThanOrEqual(0);
      expect(result.metadata.cacheMisses).toBeGreaterThanOrEqual(0);
      expect(result.metadata.queriesExecuted).toBeGreaterThanOrEqual(0);

      // Verify cache hit rate calculation
      const cacheHitRate = result.metadata.queriesExecuted > 0
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
      const dashboardRenderer = new DashboardRenderer();

      const universalFilters: DashboardUniversalFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        dateRangePreset: 'custom',
      };

      const result = await dashboardRenderer.renderDashboard(
        testDashboard.dashboard_id,
        universalFilters,
        userContext
      );

      expect(result).toBeDefined();
      expect(result.metadata.dashboardFiltersApplied).toContain('dateRange');

      log.info('Date range filter test passed', {
        filtersApplied: result.metadata.dashboardFiltersApplied,
      });
    });

    it('should apply organization filters', async () => {
      const dashboardRenderer = new DashboardRenderer();

      const universalFilters: DashboardUniversalFilters = {
        organizationId: testOrganization.organization_id,
      };

      const result = await dashboardRenderer.renderDashboard(
        testDashboard.dashboard_id,
        universalFilters,
        userContext
      );

      expect(result).toBeDefined();
      expect(result.metadata.dashboardFiltersApplied).toContain('organization');

      log.info('Organization filter test passed', {
        organizationId: testOrganization.organization_id,
        filtersApplied: result.metadata.dashboardFiltersApplied,
      });
    });

    it('should apply multiple filters simultaneously', async () => {
      const dashboardRenderer = new DashboardRenderer();

      const universalFilters: DashboardUniversalFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        organizationId: testOrganization.organization_id,
      };

      const result = await dashboardRenderer.renderDashboard(
        testDashboard.dashboard_id,
        universalFilters,
        userContext
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
      const dashboardRenderer = new DashboardRenderer();
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      await expect(
        dashboardRenderer.renderDashboard(nonExistentId, {}, userContext)
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

      const dashboardRenderer = new DashboardRenderer();

      const result = await dashboardRenderer.renderDashboard(
        emptyDashboard.dashboard_id,
        {},
        userContext
      );

      expect(result).toBeDefined();
      expect(result.metadata.chartsRendered).toBe(0);
      expect(Object.keys(result.charts).length).toBe(0);

      log.info('Empty dashboard test passed');
    });
  });

  describe('Performance', () => {
    it('should render dashboard in under 5 seconds', async () => {
      const dashboardRenderer = new DashboardRenderer();
      const startTime = Date.now();

      const result = await dashboardRenderer.renderDashboard(
        testDashboard.dashboard_id,
        {},
        userContext
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
      const dashboardRenderer = new DashboardRenderer();

      const result = await dashboardRenderer.renderDashboard(
        testDashboard.dashboard_id,
        {},
        userContext
      );

      expect(result.metadata.parallelExecution).toBe(true);

      log.info('Parallel execution test passed');
    });
  });
});

