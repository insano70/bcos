/**
 * Phase 1 Integration Tests - Filter Pipeline
 *
 * Integration tests for the unified FilterPipeline service.
 * Tests the complete flow with real organization hierarchy and RBAC.
 *
 * Tests:
 * - Organization resolution with hierarchy
 * - RBAC validation for organization filters
 * - Complete pipeline flow
 * - Integration with existing systems
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createFilterPipeline } from '@/lib/services/filters/filter-pipeline';
import type { UniversalChartFilters } from '@/lib/types/filters';
import type { UserContext } from '@/lib/types/rbac';

describe('Phase 1: Filter Pipeline Integration', () => {
  let superAdminContext: UserContext;
  let orgAdminContext: UserContext;

  beforeAll(async () => {
    // Create mock test contexts
    superAdminContext = {
      user_id: 'super-admin',
      email: 'admin@example.com',
      first_name: 'Super',
      last_name: 'Admin',
      is_active: true,
      email_verified: true,
      roles: [],
      organizations: [],
      accessible_organizations: [],
      user_roles: [],
      user_organizations: [],
      all_permissions: [],
      is_super_admin: true,
      organization_admin_for: [],
    };

    orgAdminContext = {
      user_id: 'org-admin',
      email: 'org-admin@example.com',
      first_name: 'Org',
      last_name: 'Admin',
      is_active: true,
      email_verified: true,
      roles: [],
      organizations: [],
      accessible_organizations: [
        {
          organization_id: 'test-org',
          name: 'Test Organization',
          slug: 'test-org',
          parent_organization_id: null,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ],
      user_roles: [],
      user_organizations: [],
      all_permissions: [],
      is_super_admin: false,
      organization_admin_for: ['test-org'],
    };
  });

  describe('Complete Pipeline Flow', () => {
    it('should process UniversalChartFilters through entire pipeline', async () => {
      const pipeline = createFilterPipeline(superAdminContext);

      const input: UniversalChartFilters = {
        dateRangePreset: 'last_30_days',
        measure: 'AR',
        frequency: 'Monthly',
        practiceUids: [100, 101],
      };

      const result = await pipeline.process(input, {
        component: 'test-integration',
        dataSourceId: 3,
        dataSourceType: 'measure-based',
      });

      // Verify all stages completed
      expect(result.normalized).toBeDefined();
      expect(result.resolved).toBeDefined();
      expect(result.queryParams).toBeDefined();
      expect(result.runtimeFilters).toBeDefined();
      expect(result.metadata).toBeDefined();

      // Verify metadata
      expect(result.metadata.hasMeasure).toBe(true);
      expect(result.metadata.hasFrequency).toBe(true);
      expect(result.metadata.hasDateRange).toBe(true);
      expect(result.metadata.practiceUidCount).toBe(2);

      // Verify query params have required fields
      expect(result.queryParams.data_source_id).toBe(3);
      expect(result.queryParams.measure).toBe('AR');
      expect(result.queryParams.frequency).toBe('Monthly');
      expect(result.queryParams.start_date).toBeTruthy();
      expect(result.queryParams.end_date).toBeTruthy();
    }, 10000);

    it('should process ChartFilter array through pipeline', async () => {
      const pipeline = createFilterPipeline(superAdminContext);

      const input: import('@/lib/types/analytics').ChartFilter[] = [
        { field: 'date', operator: 'gte', value: '2024-01-01' },
        { field: 'date', operator: 'lte', value: '2024-12-31' },
        { field: 'measure', operator: 'eq', value: 'AR' },
        { field: 'frequency', operator: 'eq', value: 'Monthly' },
      ];

      const result = await pipeline.process(input, {
        component: 'test-integration',
        dataSourceId: 3,
      });

      expect(result.normalized.startDate).toBe('2024-01-01');
      expect(result.normalized.endDate).toBe('2024-12-31');
      expect(result.normalized.measure).toBe('AR');
      expect(result.normalized.frequency).toBe('Monthly');
    }, 10000);

    it('should process Record<string, unknown> through pipeline', async () => {
      const pipeline = createFilterPipeline(superAdminContext);

      const input: Record<string, unknown> = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        measure: 'PNE',
        frequency: 'Weekly',
        practiceUids: [100, 101, 102],
      };

      const result = await pipeline.process(input, {
        component: 'test-integration',
        dataSourceId: 3,
      });

      expect(result.resolved.practiceUids).toEqual([100, 101, 102]);
      expect(result.runtimeFilters.measure).toBe('PNE');
      expect(result.runtimeFilters.frequency).toBe('Weekly');
    }, 10000);
  });

  describe('Organization Resolution with RBAC', () => {
    it('should allow super admin to filter by any organization', async () => {
      const pipeline = createFilterPipeline(superAdminContext);

      const input: UniversalChartFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        organizationId: 'any-org-id',
      };

      // Should not throw for super admin
      const result = await pipeline.process(input, {
        component: 'test-integration',
        dataSourceId: 3,
        enableOrgResolution: true,
      });

      expect(result.resolved.practiceUids).toBeDefined();
      expect(result.metadata.organizationResolved).toBe(true);
    }, 10000);

    it('should allow org admin to filter by their organization', async () => {
      const pipeline = createFilterPipeline(orgAdminContext);

      const orgId = orgAdminContext.accessible_organizations[0]?.organization_id;
      if (!orgId) {
        throw new Error('Test setup error: orgAdminContext has no accessible organizations');
      }

      const input: UniversalChartFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        organizationId: orgId,
      };

      // Should not throw for org admin filtering their own org
      const result = await pipeline.process(input, {
        component: 'test-integration',
        dataSourceId: 3,
        enableOrgResolution: true,
      });

      expect(result.resolved.practiceUids).toBeDefined();
      expect(result.metadata.organizationResolved).toBe(true);
    }, 10000);
  });

  describe('Quick Convert', () => {
    it('should perform quick conversion without async operations', () => {
      const pipeline = createFilterPipeline(superAdminContext);

      const input: UniversalChartFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        measure: 'AR',
        frequency: 'Monthly',
        practiceUids: [100, 101],
      };

      const result = pipeline.quickConvert(input, 'test-integration');

      expect(result.normalized).toEqual(input);
      expect(result.chartFilters).toBeDefined();
      expect(result.runtimeFilters).toBeDefined();

      // chartFilters should have all filters
      expect(result.chartFilters.length).toBeGreaterThan(0);
      expect(result.runtimeFilters.measure).toBe('AR');
      expect(result.runtimeFilters.practiceUids).toEqual([100, 101]);
    });
  });

  describe('Backwards Compatibility', () => {
    it('should produce same query params as legacy filter-builder-service', async () => {
      // Import legacy service for comparison
      const { createFilterBuilderService } = await import(
        '@/lib/services/filters/filter-builder-service'
      );

      const legacyService = createFilterBuilderService(superAdminContext);
      const newPipeline = createFilterPipeline(superAdminContext);

      const input: UniversalChartFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        measure: 'AR',
        frequency: 'Monthly',
        practiceUids: [100, 101],
      };

      // Legacy approach
      const legacyFilters = await legacyService.buildExecutionFilters(input, {
        component: 'test',
      });

      const legacyParams = legacyService.buildQueryParams(
        legacyFilters,
        { dataSourceId: 3, chartType: 'bar' },
        { component: 'test', defaultLimit: 1000 }
      );

      // New pipeline approach
      const pipelineResult = await newPipeline.process(input, {
        component: 'test',
        dataSourceId: 3,
        defaultLimit: 1000,
      });

      // Should have same data source ID
      expect(pipelineResult.queryParams.data_source_id).toBe(legacyParams.data_source_id);

      // Should have same date range
      expect(pipelineResult.queryParams.start_date).toBe(legacyParams.start_date);
      expect(pipelineResult.queryParams.end_date).toBe(legacyParams.end_date);

      // Should have same measure/frequency
      expect(pipelineResult.queryParams.measure).toBe(legacyParams.measure);
      expect(pipelineResult.queryParams.frequency).toBe(legacyParams.frequency);

      // Should have same advanced_filters (including practiceUids)
      expect(pipelineResult.queryParams.advanced_filters?.length).toBe(
        legacyParams.advanced_filters?.length
      );
    }, 10000);
  });
});

