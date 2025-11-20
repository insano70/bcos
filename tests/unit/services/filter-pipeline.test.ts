/**
 * Filter Pipeline Unit Tests
 *
 * Comprehensive test suite for the unified filter pipeline service.
 *
 * Tests:
 * - Input normalization (all formats)
 * - Filter resolution (org → practices, date presets)
 * - Query params building
 * - Runtime filters building
 * - RBAC validation
 * - Edge cases and error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createFilterPipeline } from '@/lib/services/filters/filter-pipeline';
import type { UserContext } from '@/lib/types/rbac';
import type { UniversalChartFilters, ChartExecutionFilters } from '@/lib/types/filters';
import type { ChartFilter } from '@/lib/types/analytics';
import { QUERY_LIMITS } from '@/lib/constants/analytics';

// Mock modules
vi.mock('@/lib/logger', () => ({
  log: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    security: vi.fn(),
  },
}));

vi.mock('@/lib/services/organization-access-service', () => ({
  createOrganizationAccessService: vi.fn(() => ({
    getAccessiblePracticeUids: vi.fn().mockResolvedValue({
      scope: 'all',
      practiceUids: [],
    }),
  })),
}));

vi.mock('@/lib/services/organization-hierarchy-service', () => ({
  organizationHierarchyService: {
    getAllOrganizations: vi.fn().mockResolvedValue([]),
    getHierarchyPracticeUids: vi.fn().mockResolvedValue([100, 101, 102]),
  },
}));

/**
 * Create mock user context
 */
function createMockUserContext(overrides?: Partial<UserContext>): UserContext {
  return {
    user_id: 'user-123',
    email: 'test@example.com',
    first_name: 'Test',
    last_name: 'User',
    is_active: true,
    email_verified: true,
    roles: [],
    organizations: [],
    accessible_organizations: [
      {
        organization_id: 'org-1',
        name: 'Test Org',
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
    organization_admin_for: [],
    ...overrides,
  };
}

describe('FilterPipeline', () => {
  let userContext: UserContext;
  let pipeline: ReturnType<typeof createFilterPipeline>;

  beforeEach(() => {
    userContext = createMockUserContext();
    pipeline = createFilterPipeline(userContext);
    vi.clearAllMocks();
  });

  describe('normalizeInput', () => {
    it('should pass through UniversalChartFilters unchanged', () => {
      const input: UniversalChartFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        measure: 'AR',
        frequency: 'Monthly',
      };

      const result = pipeline.quickConvert(input, 'test');

      expect(result.normalized).toEqual(input);
    });

    it('should convert ChartFilter array to UniversalChartFilters', () => {
      const input: ChartFilter[] = [
        { field: 'date', operator: 'gte', value: '2024-01-01' },
        { field: 'date', operator: 'lte', value: '2024-12-31' },
        { field: 'measure', operator: 'eq', value: 'AR' },
        { field: 'frequency', operator: 'eq', value: 'Monthly' },
        { field: 'practice_uid', operator: 'in', value: [100, 101] },
      ];

      const result = pipeline.quickConvert(input, 'test');

      expect(result.normalized.startDate).toBe('2024-01-01');
      expect(result.normalized.endDate).toBe('2024-12-31');
      expect(result.normalized.measure).toBe('AR');
      expect(result.normalized.frequency).toBe('Monthly');
      expect(result.normalized.practiceUids).toEqual([100, 101]);
    });

    it('should convert Record<string, unknown> to UniversalChartFilters', () => {
      const input: Record<string, unknown> = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        measure: 'AR',
        frequency: 'Monthly',
        practiceUids: [100, 101],
        organizationId: 'org-1',
      };

      const result = pipeline.quickConvert(input, 'test');

      expect(result.normalized.startDate).toBe('2024-01-01');
      expect(result.normalized.endDate).toBe('2024-12-31');
      expect(result.normalized.measure).toBe('AR');
      expect(result.normalized.frequency).toBe('Monthly');
      expect(result.normalized.practiceUids).toEqual([100, 101]);
      expect(result.normalized.organizationId).toBe('org-1');
    });

    it('should handle ChartExecutionFilters format', () => {
      const input: ChartExecutionFilters = {
        dateRange: {
          startDate: '2024-01-01',
          endDate: '2024-12-31',
        },
        practiceUids: [100, 101],
        advancedFilters: [],
        measure: 'AR',
        frequency: 'Monthly',
      };

      const result = pipeline.quickConvert(input, 'test');

      expect(result.normalized.startDate).toBe('2024-01-01');
      expect(result.normalized.endDate).toBe('2024-12-31');
      expect(result.normalized.practiceUids).toEqual([100, 101]);
      expect(result.normalized.measure).toBe('AR');
      expect(result.normalized.frequency).toBe('Monthly');
    });

    it('should handle advanced filters in ChartFilter array', () => {
      const input: ChartFilter[] = [
        { field: 'measure', operator: 'eq', value: 'AR' },
        { field: 'location', operator: 'eq', value: 'downtown' },
        { field: 'lob', operator: 'in', value: ['commercial', 'medicare'] },
      ];

      const result = pipeline.quickConvert(input, 'test');

      expect(result.normalized.measure).toBe('AR');
      expect(result.normalized.advancedFilters).toHaveLength(2);
      expect(result.normalized.advancedFilters?.[0]?.field).toBe('location');
      expect(result.normalized.advancedFilters?.[1]?.field).toBe('lob');
    });
  });

  describe('toChartFilterArray', () => {
    it('should convert UniversalChartFilters to ChartFilter array', () => {
      const input: UniversalChartFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        measure: 'AR',
        frequency: 'Monthly',
        practiceUids: [100, 101],
      };

      const result = pipeline.toChartFilterArray(input);

      expect(result).toContainEqual({ field: 'date', operator: 'gte', value: '2024-01-01' });
      expect(result).toContainEqual({ field: 'date', operator: 'lte', value: '2024-12-31' });
      expect(result).toContainEqual({ field: 'measure', operator: 'eq', value: 'AR' });
      expect(result).toContainEqual({ field: 'frequency', operator: 'eq', value: 'Monthly' });
      expect(result).toContainEqual({ field: 'practice_uid', operator: 'in', value: [100, 101] });
    });

    it('should handle empty practiceUids array', () => {
      const input: UniversalChartFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        practiceUids: [],
      };

      const result = pipeline.toChartFilterArray(input);

      // Empty practiceUids should NOT be included
      expect(result.some((f) => f.field === 'practice_uid')).toBe(false);
    });

    it('should pass through advanced filters', () => {
      const advancedFilters: ChartFilter[] = [
        { field: 'location', operator: 'eq', value: 'downtown' },
        { field: 'lob', operator: 'in', value: ['commercial'] },
      ];

      const input: UniversalChartFilters = {
        startDate: '2024-01-01',
        advancedFilters,
      };

      const result = pipeline.toChartFilterArray(input);

      expect(result).toContainEqual(advancedFilters[0]);
      expect(result).toContainEqual(advancedFilters[1]);
    });
  });

  describe('buildQueryParams', () => {
    it('should build query params with practiceUids', async () => {
      const input: UniversalChartFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        measure: 'AR',
        frequency: 'Monthly',
        practiceUids: [100, 101],
      };

      const result = await pipeline.process(input, {
        component: 'test',
        dataSourceId: 3,
        dataSourceType: 'measure-based',
      });

      expect(result.queryParams.data_source_id).toBe(3);
      expect(result.queryParams.start_date).toBe('2024-01-01');
      expect(result.queryParams.end_date).toBe('2024-12-31');
      expect(result.queryParams.measure).toBe('AR');
      expect(result.queryParams.frequency).toBe('Monthly');
      expect(result.queryParams.advanced_filters).toBeDefined();

      // practiceUids should be in advanced_filters
      const practiceFilter = result.queryParams.advanced_filters?.find(
        (f: ChartFilter) => f.field === 'practice_uid'
      );
      expect(practiceFilter).toBeDefined();
      expect(practiceFilter?.operator).toBe('in');
      expect(practiceFilter?.value).toEqual([100, 101]);
    });

    it('should apply fail-closed security for empty practiceUids', async () => {
      const input: UniversalChartFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        measure: 'AR',
        frequency: 'Monthly',
        practiceUids: [], // Empty array
      };

      const result = await pipeline.process(input, {
        component: 'test',
        dataSourceId: 3,
        failClosedSecurity: true,
      });

      // Should have impossible practice_uid filter
      const practiceFilter = result.queryParams.advanced_filters?.find(
        (f: ChartFilter) => f.field === 'practice_uid'
      );
      expect(practiceFilter).toBeDefined();
      expect(practiceFilter?.value).toEqual([-1]); // Impossible value
    });

    it('should use default limit if not specified', async () => {
      const input: UniversalChartFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      };

      const result = await pipeline.process(input, {
        component: 'test',
        dataSourceId: 3,
      });

      expect(result.queryParams.limit).toBe(QUERY_LIMITS.DEFAULT_ANALYTICS_LIMIT);
    });

    it('should use custom limit if specified', async () => {
      const input: UniversalChartFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      };

      const result = await pipeline.process(input, {
        component: 'test',
        dataSourceId: 3,
        defaultLimit: 500,
      });

      expect(result.queryParams.limit).toBe(500);
    });
  });

  describe('buildRuntimeFilters', () => {
    it('should build runtime filters with all fields', async () => {
      const input: UniversalChartFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        measure: 'AR',
        frequency: 'Monthly',
        practiceUids: [100, 101],
        providerName: 'Dr. Smith',
        advancedFilters: [{ field: 'location', operator: 'eq', value: 'downtown' }],
      };

      const result = await pipeline.process(input, {
        component: 'test',
        dataSourceId: 3,
      });

      expect(result.runtimeFilters.startDate).toBe('2024-01-01');
      expect(result.runtimeFilters.endDate).toBe('2024-12-31');
      expect(result.runtimeFilters.measure).toBe('AR');
      expect(result.runtimeFilters.frequency).toBe('Monthly');
      expect(result.runtimeFilters.practiceUids).toEqual([100, 101]);
      expect(result.runtimeFilters.providerName).toBe('Dr. Smith');
      expect(result.runtimeFilters.advancedFilters).toHaveLength(1);
    });

    it('should omit empty practiceUids from runtime filters', async () => {
      const input: UniversalChartFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        practiceUids: [],
      };

      const result = await pipeline.process(input, {
        component: 'test',
        dataSourceId: 3,
      });

      // Empty practiceUids should NOT be in runtime filters
      expect(result.runtimeFilters.practiceUids).toBeUndefined();
    });

    it('should only include fields with values', async () => {
      const input: UniversalChartFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        // No measure, frequency, etc.
      };

      const result = await pipeline.process(input, {
        component: 'test',
        dataSourceId: 3,
      });

      expect(result.runtimeFilters.measure).toBeUndefined();
      expect(result.runtimeFilters.frequency).toBeUndefined();
      expect(result.runtimeFilters.providerName).toBeUndefined();
      expect(result.runtimeFilters.startDate).toBe('2024-01-01');
      expect(result.runtimeFilters.endDate).toBe('2024-12-31');
    });
  });

  describe('organization resolution', () => {
    it('should resolve organizationId to practiceUids', async () => {
      const input: UniversalChartFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        organizationId: 'org-1',
      };

      const result = await pipeline.process(input, {
        component: 'test',
        dataSourceId: 3,
        enableOrgResolution: true,
      });

      // Should have resolved to practice UIDs
      expect(result.resolved.practiceUids).toEqual([100, 101, 102]);
      expect(result.metadata.organizationResolved).toBe(true);
      expect(result.metadata.practiceUidCount).toBe(3);
    });

    it('should prefer explicit practiceUids over organizationId', async () => {
      const input: UniversalChartFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        organizationId: 'org-1',
        practiceUids: [200, 201], // Explicit practices
      };

      const result = await pipeline.process(input, {
        component: 'test',
        dataSourceId: 3,
        enableOrgResolution: false, // Disabled, should use explicit
      });

      // Should use explicit practiceUids, not resolve org
      expect(result.resolved.practiceUids).toEqual([200, 201]);
    });

    it('should handle missing organizationId gracefully', async () => {
      const input: UniversalChartFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      };

      const result = await pipeline.process(input, {
        component: 'test',
        dataSourceId: 3,
        enableOrgResolution: true,
      });

      // No org filter → empty practiceUids
      expect(result.resolved.practiceUids).toEqual([]);
      expect(result.metadata.organizationResolved).toBe(false);
    });
  });

  describe('date range resolution', () => {
    it('should use explicit dates over preset', async () => {
      const input: UniversalChartFilters = {
        dateRangePreset: 'last_30_days',
        startDate: '2024-01-01', // Explicit takes precedence
        endDate: '2024-12-31',
      };

      const result = await pipeline.process(input, {
        component: 'test',
        dataSourceId: 3,
      });

      expect(result.resolved.dateRange.startDate).toBe('2024-01-01');
      expect(result.resolved.dateRange.endDate).toBe('2024-12-31');
    });

    it('should resolve date presets', async () => {
      const input: UniversalChartFilters = {
        dateRangePreset: 'year_to_date',
      };

      const result = await pipeline.process(input, {
        component: 'test',
        dataSourceId: 3,
      });

      // Should have resolved dates from preset
      expect(result.resolved.dateRange.startDate).toBeTruthy();
      expect(result.resolved.dateRange.endDate).toBeTruthy();
      expect(result.metadata.hasDateRange).toBe(true);
    });
  });

  describe('advanced filters', () => {
    it('should preserve advanced filters through pipeline', async () => {
      const advancedFilters: ChartFilter[] = [
        { field: 'location', operator: 'eq', value: 'downtown' },
        { field: 'lob', operator: 'in', value: ['commercial', 'medicare'] },
      ];

      const input: UniversalChartFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        advancedFilters,
      };

      const result = await pipeline.process(input, {
        component: 'test',
        dataSourceId: 3,
      });

      expect(result.resolved.advancedFilters).toHaveLength(2);
      expect(result.runtimeFilters.advancedFilters).toHaveLength(2);
      expect(result.queryParams.advanced_filters).toContainEqual(advancedFilters[0]);
      expect(result.queryParams.advanced_filters).toContainEqual(advancedFilters[1]);
    });

    it('should merge practiceUids into advanced_filters for query params', async () => {
      const input: UniversalChartFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        practiceUids: [100, 101],
        advancedFilters: [{ field: 'location', operator: 'eq', value: 'downtown' }],
      };

      const result = await pipeline.process(input, {
        component: 'test',
        dataSourceId: 3,
      });

      // Should have both advanced filters + practiceUids filter
      expect(result.queryParams.advanced_filters).toHaveLength(2);

      const practiceFilter = result.queryParams.advanced_filters?.find(
        (f: ChartFilter) => f.field === 'practice_uid'
      );
      const locationFilter = result.queryParams.advanced_filters?.find(
        (f) => f.field === 'location'
      );

      expect(practiceFilter).toBeDefined();
      expect(practiceFilter?.value).toEqual([100, 101]);
      expect(locationFilter).toBeDefined();
      expect(locationFilter?.value).toBe('downtown');
    });
  });

  describe('metadata', () => {
    it('should collect accurate metadata', async () => {
      const input: UniversalChartFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        measure: 'AR',
        frequency: 'Monthly',
        organizationId: 'org-1',
      };

      const result = await pipeline.process(input, {
        component: 'test',
        dataSourceId: 3,
        enableOrgResolution: true,
      });

      expect(result.metadata.organizationResolved).toBe(true);
      expect(result.metadata.practiceUidCount).toBe(3); // Mocked to return [100, 101, 102]
      expect(result.metadata.hasDateRange).toBe(true);
      expect(result.metadata.hasMeasure).toBe(true);
      expect(result.metadata.hasFrequency).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle null/undefined values gracefully', () => {
      const input: Record<string, unknown> = {
        startDate: null,
        endDate: undefined,
        measure: '',
        practiceUids: null,
      };

      const result = pipeline.quickConvert(input, 'test');

      // Should not include null/undefined/empty values
      expect(result.normalized.startDate).toBeUndefined();
      expect(result.normalized.endDate).toBeUndefined();
      expect(result.normalized.measure).toBeUndefined();
      expect(result.normalized.practiceUids).toBeUndefined();
    });

    it('should handle empty input gracefully', async () => {
      const input: UniversalChartFilters = {};

      const result = await pipeline.process(input, {
        component: 'test',
        dataSourceId: 3,
      });

      expect(result.resolved.practiceUids).toEqual([]);
      expect(result.resolved.advancedFilters).toEqual([]);
      expect(result.metadata.organizationResolved).toBe(false);
    });

    it('should handle frequency alias (time_period)', () => {
      const input: ChartFilter[] = [
        { field: 'time_period', operator: 'eq', value: 'Monthly' },
      ];

      const result = pipeline.quickConvert(input, 'test');

      // time_period should be normalized to frequency
      expect(result.normalized.frequency).toBe('Monthly');
    });
  });

  describe('quickConvert', () => {
    it('should perform fast conversion without resolution', () => {
      const input: UniversalChartFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        measure: 'AR',
        practiceUids: [100, 101],
      };

      const result = pipeline.quickConvert(input, 'test');

      expect(result.normalized).toEqual(input);
      expect(result.chartFilters).toHaveLength(4); // 2 dates + measure + practiceUids
      expect(result.runtimeFilters.startDate).toBe('2024-01-01');
      expect(result.runtimeFilters.measure).toBe('AR');
    });

    it('should not perform async operations in quickConvert', () => {
      const input: UniversalChartFilters = {
        organizationId: 'org-1', // Would normally trigger resolution
        startDate: '2024-01-01',
      };

      const result = pipeline.quickConvert(input, 'test');

      // organizationId should be preserved (not resolved)
      expect(result.normalized.organizationId).toBe('org-1');
    });
  });

  describe('type safety', () => {
    it('should maintain type safety through pipeline', async () => {
      const input: UniversalChartFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        measure: 'AR',
        frequency: 'Monthly',
      };

      const result = await pipeline.process(input, {
        component: 'test',
        dataSourceId: 3,
        dataSourceType: 'measure-based',
      });

      // Check all result types are properly typed
      expect(typeof result.normalized).toBe('object');
      expect(typeof result.resolved).toBe('object');
      expect(typeof result.queryParams).toBe('object');
      expect(typeof result.runtimeFilters).toBe('object');
      expect(typeof result.metadata).toBe('object');
    });
  });
});

