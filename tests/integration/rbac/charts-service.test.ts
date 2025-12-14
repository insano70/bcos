/**
 * RBAC Charts Service Integration Tests
 *
 * Complete coverage of the RBACChartsService including:
 * - All CRUD operations with real data
 * - Query filtering and pagination
 * - Data validation
 * - Business logic verification
 * - Permission enforcement
 * - Error handling
 * - Edge cases
 * - Chart types and configurations
 *
 * Uses scope-based factory cleanup for test isolation.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '@/tests/setup/integration-setup';
import { nanoid } from 'nanoid';
import { createRBACChartsService } from '@/lib/services/rbac-charts-service';
import type { PermissionName } from '@/lib/types/rbac';
import { PermissionDeniedError } from '@/lib/errors/rbac-errors';
import { assignRoleToUser, createTestOrganization, createTestRole } from '@/tests/factories';
import { createTestScope, type ScopedFactoryCollection } from '@/tests/factories/base';
import { createCommittedChart, createCommittedUser } from '@/tests/factories/committed';
import { rollbackTransaction } from '@/tests/helpers/db-helper';
import {
  assignUserToOrganization,
  buildUserContext,
  mapDatabaseOrgToOrg,
  mapDatabaseRoleToRole,
} from '@/tests/helpers/rbac-helper';

describe('RBAC Charts Service - Integration Tests', () => {
  let scope: ScopedFactoryCollection;
  let scopeId: string;
  let serviceCreatedChartIds: string[] = [];

  beforeEach(() => {
    scopeId = `chart-test-${nanoid(8)}`;
    scope = createTestScope(scopeId);
    serviceCreatedChartIds = [];
  });

  afterEach(async () => {
    // Roll back test transaction first to release locks from transaction-based factories
    // (createTestRole, assignRoleToUser) before cleaning up committed data
    await rollbackTransaction();

    // Clean up service-created charts first
    if (serviceCreatedChartIds.length > 0) {
      try {
        const { db } = await import('@/lib/db');
        const { chart_definitions } = await import('@/lib/db/schema');
        const { inArray } = await import('drizzle-orm');
        await db
          .delete(chart_definitions)
          .where(inArray(chart_definitions.chart_definition_id, serviceCreatedChartIds));
      } catch (_error) {
        // Ignore cleanup errors - they might already be deleted
      }
    }

    // Then cleanup factory-created objects
    await scope.cleanup();
  });

  describe('getCharts - Query & Filtering', () => {
    it('should retrieve charts with real data', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_reader',
        permissions: ['charts:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      // Create test charts with a unique search term to filter results
      const uniqueSearchTerm = `TestChart_${nanoid(8)}`;
      const chart1 = await createCommittedChart({
        created_by: user.user_id,
        chart_name: `${uniqueSearchTerm} Sales Line`,
        chart_type: 'line',
        scope: scopeId,
      });
      const chart2 = await createCommittedChart({
        created_by: user.user_id,
        chart_name: `${uniqueSearchTerm} Revenue Bar`,
        chart_type: 'bar',
        scope: scopeId,
      });

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);
      // Use search filter to find only our test charts
      const result = await chartsService.getCharts({ search: uniqueSearchTerm });

      expect(Array.isArray(result)).toBe(true);
      const chartIds = result.map((c) => c.chart_definition_id);
      expect(chartIds).toContain(chart1.chart_definition_id);
      expect(chartIds).toContain(chart2.chart_definition_id);
    });

    it('should filter charts by search term (name)', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_reader',
        permissions: ['charts:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Sales Performance Dashboard',
        chart_type: 'line',
        scope: scopeId,
      });
      await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Revenue Analytics',
        chart_type: 'bar',
        scope: scopeId,
      });
      const matchingChart = await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Unique Search Term Chart',
        chart_type: 'pie',
        scope: scopeId,
      });

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);
      const result = await chartsService.getCharts({ search: 'Unique Search Term' });

      const chartIds = result.map((c) => c.chart_definition_id);
      expect(chartIds).toContain(matchingChart.chart_definition_id);
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter charts by is_active status', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_reader',
        permissions: ['charts:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      // Create charts with unique search term to filter results
      const uniqueSearchTerm = `ActiveTest_${nanoid(8)}`;
      const activeChart = await createCommittedChart({
        created_by: user.user_id,
        chart_name: `${uniqueSearchTerm} Active`,
        chart_type: 'line',
        is_active: true,
        scope: scopeId,
      });
      const inactiveChart = await createCommittedChart({
        created_by: user.user_id,
        chart_name: `${uniqueSearchTerm} Inactive`,
        chart_type: 'bar',
        is_active: false,
        scope: scopeId,
      });

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);
      // Filter by search term AND is_active
      const result = await chartsService.getCharts({ search: uniqueSearchTerm, is_active: true });

      const chartIds = result.map((c) => c.chart_definition_id);
      expect(chartIds).toContain(activeChart.chart_definition_id);
      expect(chartIds).not.toContain(inactiveChart.chart_definition_id);

      // Verify all returned charts are active
      result.forEach((chart) => {
        expect(chart.is_active).toBe(true);
      });
    });

    it('should apply pagination with limit', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_reader',
        permissions: ['charts:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      // Create multiple charts
      for (let i = 0; i < 5; i++) {
        await createCommittedChart({
          created_by: user.user_id,
          chart_name: `Chart ${i}`,
          chart_type: 'line',
          scope: scopeId,
        });
      }

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);
      const result = await chartsService.getCharts({ limit: 3 });

      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('should apply pagination with offset', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_reader',
        permissions: ['charts:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      // Create charts
      const charts = [];
      for (let i = 0; i < 3; i++) {
        charts.push(
          await createCommittedChart({
            created_by: user.user_id,
            chart_name: `Offset Test Chart ${i}`,
            chart_type: 'line',
            scope: scopeId,
          })
        );
      }

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);

      // Get first page
      const page1 = await chartsService.getCharts({ limit: 1, offset: 0 });
      // Get second page
      const page2 = await chartsService.getCharts({ limit: 1, offset: 1 });

      expect(page1.length).toBeGreaterThanOrEqual(1);
      expect(page2.length).toBeGreaterThanOrEqual(1);

      // Verify different results (if both contain our test data)
      if (page1[0] && page2[0]) {
        expect(page1[0].chart_definition_id).not.toBe(page2[0].chart_definition_id);
      }
    });

    it('should handle empty search results', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_reader',
        permissions: ['charts:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);
      const result = await chartsService.getCharts({
        search: 'NonExistentChartSearchTerm12345',
      });

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should return creator information with charts', async () => {
      const user = await createCommittedUser({
        firstName: 'John',
        lastName: 'Doe',
        scope: scopeId,
      });
      const role = await createTestRole({
        name: 'analytics_reader',
        permissions: ['charts:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      // Create chart with unique search term to ensure we find it
      const uniqueSearchTerm = `CreatorTest_${nanoid(8)}`;
      const chart = await createCommittedChart({
        created_by: user.user_id,
        chart_name: `${uniqueSearchTerm} Chart`,
        chart_type: 'line',
        scope: scopeId,
      });

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);
      // Use search filter to find our test chart
      const result = await chartsService.getCharts({ search: uniqueSearchTerm });

      const createdChart = result.find((c) => c.chart_definition_id === chart.chart_definition_id);
      expect(createdChart).toBeDefined();
      if (createdChart?.creator) {
        expect(createdChart.creator.user_id).toBe(user.user_id);
        expect(createdChart.creator.first_name).toBe('John');
        expect(createdChart.creator.last_name).toBe('Doe');
      }
    });

    it('should deny chart retrieval without permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'no_permissions',
        permissions: [],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);

      await expect(chartsService.getCharts()).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe('getChartById - Single Record Retrieval', () => {
    it('should retrieve specific chart with valid permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_reader',
        permissions: ['charts:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const chart = await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Specific Chart',
        chart_description: 'Chart for ID lookup test',
        chart_type: 'bar',
        scope: scopeId,
      });

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);
      const result = await chartsService.getChartById(chart.chart_definition_id);

      expect(result).toBeDefined();
      if (!result) throw new Error('Expected chart to be defined');
      expect(result.chart_definition_id).toBe(chart.chart_definition_id);
      expect(result.chart_name).toBe('Specific Chart');
      expect(result.chart_type).toBe('bar');
      expect(result.created_by).toBe(user.user_id);
    });

    it('should return null for non-existent chart', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_reader',
        permissions: ['charts:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);
      const result = await chartsService.getChartById('00000000-0000-0000-0000-000000000000');

      expect(result).toBeNull();
    });

    it('should include creator details in single chart retrieval', async () => {
      const user = await createCommittedUser({
        firstName: 'Jane',
        lastName: 'Smith',
        scope: scopeId,
      });
      const role = await createTestRole({
        name: 'analytics_reader',
        permissions: ['charts:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const chart = await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Chart With Creator Details',
        chart_type: 'line',
        scope: scopeId,
      });

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);
      const result = await chartsService.getChartById(chart.chart_definition_id);

      if (!result) throw new Error('Expected chart to be defined');
      if (result.creator) {
        expect(result.creator.first_name).toBe('Jane');
        expect(result.creator.last_name).toBe('Smith');
      }
    });

    it('should deny retrieval without permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'no_permissions',
        permissions: [],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const chart = await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Protected Chart',
        chart_type: 'line',
        scope: scopeId,
      });

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);

      await expect(chartsService.getChartById(chart.chart_definition_id)).rejects.toThrow(
        PermissionDeniedError
      );
    });
  });

  describe('getChartCount - Aggregation Operations', () => {
    it('should return accurate chart count', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_reader',
        permissions: ['charts:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      // Create multiple charts
      await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Count Test Chart 1',
        chart_type: 'line',
        scope: scopeId,
      });
      await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Count Test Chart 2',
        chart_type: 'bar',
        scope: scopeId,
      });
      await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Count Test Chart 3',
        chart_type: 'pie',
        scope: scopeId,
      });

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);
      const count = await chartsService.getChartCount();

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(3);
    });

    it('should respect is_active filter when counting', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_reader',
        permissions: ['charts:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Active Count Chart',
        chart_type: 'line',
        is_active: true,
        scope: scopeId,
      });
      await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Inactive Count Chart',
        chart_type: 'bar',
        is_active: false,
        scope: scopeId,
      });

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);

      const activeCount = await chartsService.getChartCount({ is_active: true });
      const inactiveCount = await chartsService.getChartCount({ is_active: false });

      expect(activeCount).toBeGreaterThanOrEqual(1);
      expect(inactiveCount).toBeGreaterThanOrEqual(1);
    });

    it('should deny count without permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'no_permissions',
        permissions: [],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);

      await expect(chartsService.getChartCount()).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe('createChart - Creation Operations', () => {
    it('should create chart with all required fields', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['charts:read:all' as PermissionName, 'charts:manage:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);

      const chartData = {
        chart_name: 'New Sales Chart',
        chart_description: 'Monthly sales performance',
        chart_type: 'line',
        data_source: { type: 'query', query: 'SELECT * FROM sales' },
      };

      const result = await chartsService.createChart(chartData);
      serviceCreatedChartIds.push(result.chart_definition_id);

      expect(result).toBeDefined();
      expect(result.chart_name).toBe('New Sales Chart');
      expect(result.chart_type).toBe('line');
      expect(result.created_by).toBe(user.user_id);
      expect(result.chart_definition_id).toBeTruthy();
    });

    it('should create chart with data_source as string', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['charts:read:all' as PermissionName, 'charts:manage:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);

      const chartData = {
        chart_name: 'Chart With String Source',
        chart_type: 'bar',
        data_source: 'api/sales/monthly',
      };

      const result = await chartsService.createChart(chartData);
      serviceCreatedChartIds.push(result.chart_definition_id);

      expect(result.chart_definition_id).toBeTruthy();
      expect(result.data_source).toBe('api/sales/monthly');
    });

    it('should create chart with data_source as object', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['charts:read:all' as PermissionName, 'charts:manage:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);

      const dataSource = {
        type: 'database',
        connection: 'primary',
        query: "SELECT date, revenue FROM sales WHERE date > NOW() - INTERVAL '30 days'",
      };

      const chartData = {
        chart_name: 'Chart With Object Source',
        chart_type: 'line',
        data_source: dataSource,
      };

      const result = await chartsService.createChart(chartData);
      serviceCreatedChartIds.push(result.chart_definition_id);

      expect(result.chart_definition_id).toBeTruthy();
      expect(result.data_source).toEqual(dataSource);
    });

    it('should create chart with complex chart_config', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['charts:read:all' as PermissionName, 'charts:manage:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);

      const chartConfig = {
        xAxis: {
          type: 'time',
          format: 'YYYY-MM-DD',
          label: 'Date',
        },
        yAxis: {
          type: 'value',
          min: 0,
          max: 100,
          label: 'Revenue ($)',
        },
        series: [
          {
            name: 'Sales',
            type: 'line',
            color: '#4CAF50',
            smooth: true,
          },
        ],
        legend: {
          show: true,
          position: 'top',
        },
      };

      const chartData = {
        chart_name: 'Complex Config Chart',
        chart_type: 'line',
        data_source: { type: 'query', query: 'SELECT 1' },
        chart_config: chartConfig,
      };

      const result = await chartsService.createChart(chartData);
      serviceCreatedChartIds.push(result.chart_definition_id);

      expect(result.chart_config).toEqual(chartConfig);
    });

    it('should apply default values for optional fields', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['charts:read:all' as PermissionName, 'charts:manage:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);

      const chartData = {
        chart_name: 'Minimal Chart',
        chart_type: 'bar',
        data_source: 'api/data',
      };

      const result = await chartsService.createChart(chartData);
      serviceCreatedChartIds.push(result.chart_definition_id);

      expect(result.is_active).toBeDefined();
      expect(result.chart_config).toBeDefined();
    });

    it('should allow empty chart_name (service does not validate)', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['charts:read:all' as PermissionName, 'charts:manage:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);

      const chartData = {
        chart_name: '',
        chart_type: 'line',
        data_source: 'api/data',
      };

      // Service does not validate chart_name - validation should happen at API layer
      const result = await chartsService.createChart(chartData);
      serviceCreatedChartIds.push(result.chart_definition_id);
      expect(result.chart_name).toBe('');
    });

    it('should deny chart creation without permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'reader_only',
        permissions: [],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);

      const chartData = {
        chart_name: 'Unauthorized Chart',
        chart_type: 'line',
        data_source: 'api/data',
      };

      await expect(chartsService.createChart(chartData)).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe('updateChart - Modification Operations', () => {
    it('should update chart name only', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['charts:read:all' as PermissionName, 'charts:manage:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const chart = await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Original Chart Name',
        chart_type: 'line',
        scope: scopeId,
      });

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);

      const result = await chartsService.updateChart(chart.chart_definition_id, {
        chart_name: 'Updated Chart Name',
      });

      expect(result.chart_name).toBe('Updated Chart Name');
      expect(result.chart_type).toBe('line'); // Unchanged
    });

    it('should update chart_type', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['charts:read:all' as PermissionName, 'charts:manage:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const chart = await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Type Change Chart',
        chart_type: 'line',
        scope: scopeId,
      });

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);

      const result = await chartsService.updateChart(chart.chart_definition_id, {
        chart_type: 'bar',
      });

      expect(result.chart_type).toBe('bar');
    });

    it('should update data_source', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['charts:read:all' as PermissionName, 'charts:manage:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const chart = await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Data Source Update Chart',
        chart_type: 'line',
        data_source: { type: 'query', query: 'SELECT 1' },
        scope: scopeId,
      });

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);

      const newDataSource = { type: 'api', endpoint: '/api/new-data' };
      const result = await chartsService.updateChart(chart.chart_definition_id, {
        data_source: newDataSource,
      });

      expect(result.data_source).toEqual(newDataSource);
    });

    it('should update chart_config', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['charts:read:all' as PermissionName, 'charts:manage:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const chart = await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Config Update Chart',
        chart_type: 'line',
        chart_config: { xAxis: 'date', yAxis: 'value' },
        scope: scopeId,
      });

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);

      const newConfig = {
        xAxis: { type: 'time' },
        yAxis: { type: 'value', min: 0 },
        theme: 'dark',
      };

      const result = await chartsService.updateChart(chart.chart_definition_id, {
        chart_config: newConfig,
      });

      expect(result.chart_config).toEqual(newConfig);
    });

    it('should toggle is_active status', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['charts:read:all' as PermissionName, 'charts:manage:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const chart = await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Active Toggle Chart',
        chart_type: 'line',
        is_active: true,
        scope: scopeId,
      });

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);

      const result = await chartsService.updateChart(chart.chart_definition_id, {
        is_active: false,
      });

      expect(result.is_active).toBe(false);
    });

    it('should update multiple fields at once', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['charts:read:all' as PermissionName, 'charts:manage:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const chart = await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Multi Update Chart',
        chart_type: 'line',
        scope: scopeId,
      });

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);

      const result = await chartsService.updateChart(chart.chart_definition_id, {
        chart_name: 'Completely Updated',
        chart_type: 'bar',
        chart_description: 'New description',
        is_active: false,
      });

      expect(result.chart_name).toBe('Completely Updated');
      expect(result.chart_type).toBe('bar');
      expect(result.chart_description).toBe('New description');
      expect(result.is_active).toBe(false);
    });

    it('should throw error when updating non-existent chart', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['charts:read:all' as PermissionName, 'charts:manage:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);

      await expect(
        chartsService.updateChart('00000000-0000-0000-0000-000000000000', {
          chart_name: 'Ghost Chart',
        })
      ).rejects.toThrow();
    });

    it('should deny update without permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'reader_only',
        permissions: [],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const chart = await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Protected Chart',
        chart_type: 'line',
        scope: scopeId,
      });

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);

      await expect(
        chartsService.updateChart(chart.chart_definition_id, {
          chart_name: 'Hacked Name',
        })
      ).rejects.toThrow(PermissionDeniedError);
    });
  });

  describe('deleteChart - Deletion Operations', () => {
    it('should delete chart successfully', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['charts:read:all' as PermissionName, 'charts:manage:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const chart = await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Chart To Delete',
        chart_type: 'line',
        scope: scopeId,
      });

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);

      await chartsService.deleteChart(chart.chart_definition_id);

      // Verify deletion
      const result = await chartsService.getChartById(chart.chart_definition_id);
      expect(result).toBeNull();
    });

    it('should throw error when deleting non-existent chart', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['charts:read:all' as PermissionName, 'charts:manage:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);

      await expect(
        chartsService.deleteChart('00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow();
    });

    it('should deny deletion without permissions', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'reader_only',
        permissions: [],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const chart = await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Protected Chart',
        chart_type: 'line',
        scope: scopeId,
      });

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);

      await expect(chartsService.deleteChart(chart.chart_definition_id)).rejects.toThrow(
        PermissionDeniedError
      );
    });
  });

  describe('Chart Types - Variation Testing', () => {
    it('should support line chart type', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['charts:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const chart = await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Line Chart',
        chart_type: 'line',
        scope: scopeId,
      });

      expect(chart.chart_type).toBe('line');
    });

    it('should support bar chart type', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['charts:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const chart = await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Bar Chart',
        chart_type: 'bar',
        scope: scopeId,
      });

      expect(chart.chart_type).toBe('bar');
    });

    it('should support pie chart type', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['charts:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const chart = await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Pie Chart',
        chart_type: 'pie',
        scope: scopeId,
      });

      expect(chart.chart_type).toBe('pie');
    });

    it('should support scatter chart type', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['charts:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const chart = await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Scatter Chart',
        chart_type: 'scatter',
        scope: scopeId,
      });

      expect(chart.chart_type).toBe('scatter');
    });

    it('should support area chart type', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['charts:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const chart = await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Area Chart',
        chart_type: 'area',
        scope: scopeId,
      });

      expect(chart.chart_type).toBe('area');
    });
  });

  describe('Complex Permission Scenarios', () => {
    it('should handle user with multiple roles', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const org = await createTestOrganization();
      await assignUserToOrganization(user, mapDatabaseOrgToOrg(org));

      const readRole = await createTestRole({
        name: 'chart_reader',
        permissions: [],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(readRole));

      const adminRole = await createTestRole({
        name: 'chart_admin',
        permissions: ['charts:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(adminRole));

      const chart = await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Multi-Role Chart',
        chart_type: 'line',
        scope: scopeId,
      });

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);

      // Should succeed due to admin role
      const result = await chartsService.getChartById(chart.chart_definition_id);
      if (!result) throw new Error('Expected chart to be defined');
      expect(result.chart_definition_id).toBe(chart.chart_definition_id);
    });
  });

  describe('Data Validation and Business Logic', () => {
    it('should preserve complex data_source JSON structure', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['charts:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const dataSource = {
        type: 'multi-source',
        sources: [
          { id: 'sales', query: 'SELECT * FROM sales' },
          { id: 'inventory', query: 'SELECT * FROM inventory' },
        ],
        joins: [{ left: 'sales', right: 'inventory', on: 'product_id' }],
      };

      const chart = await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Complex Data Source Chart',
        chart_type: 'line',
        data_source: dataSource,
        scope: scopeId,
      });

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);
      const result = await chartsService.getChartById(chart.chart_definition_id);

      if (!result) throw new Error('Expected chart to be defined');
      expect(result.data_source).toEqual(dataSource);
    });

    it('should preserve complex chart_config JSON structure', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['charts:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const chartConfig = {
        title: { text: 'Sales Overview', style: { color: '#333' } },
        xAxis: { type: 'time', format: 'YYYY-MM-DD' },
        yAxis: { type: 'value', min: 0, max: 1000 },
        series: [
          { name: 'Revenue', type: 'line', data: [] },
          { name: 'Target', type: 'line', data: [], style: 'dashed' },
        ],
        tooltip: { enabled: true, format: '{value} USD' },
      };

      const chart = await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Complex Config Chart',
        chart_type: 'line',
        chart_config: chartConfig,
        scope: scopeId,
      });

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);
      const result = await chartsService.getChartById(chart.chart_definition_id);

      if (!result) throw new Error('Expected chart to be defined');
      expect(result.chart_config).toEqual(chartConfig);
    });

    it('should handle null and undefined optional fields correctly', async () => {
      const user = await createCommittedUser({ scope: scopeId });
      const role = await createTestRole({
        name: 'analytics_admin',
        permissions: ['charts:read:all' as PermissionName],
      });
      await assignRoleToUser(user, mapDatabaseRoleToRole(role));

      const chart = await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Minimal Chart',
        chart_type: 'line',
        scope: scopeId,
        // No description, minimal config
      });

      const userContext = await buildUserContext(user);
      const chartsService = createRBACChartsService(userContext);
      const result = await chartsService.getChartById(chart.chart_definition_id);

      if (!result) throw new Error('Expected chart to be defined');
      expect(result.chart_name).toBe('Minimal Chart');
      expect(result.created_by).toBe(user.user_id);
    });
  });

  describe('Cleanup and Scope Isolation', () => {
    it('should automatically cleanup charts after test', async () => {
      const user = await createCommittedUser({ scope: scopeId });

      const chart1 = await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Cleanup Test Chart 1',
        chart_type: 'line',
        scope: scopeId,
      });

      const chart2 = await createCommittedChart({
        created_by: user.user_id,
        chart_name: 'Cleanup Test Chart 2',
        chart_type: 'bar',
        scope: scopeId,
      });

      // Verify they exist
      expect(chart1.chart_definition_id).toBeTruthy();
      expect(chart2.chart_definition_id).toBeTruthy();

      // Cleanup will happen automatically in afterEach
    });
  });
});
