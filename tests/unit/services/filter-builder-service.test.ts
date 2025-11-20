/**
 * FilterBuilderService Unit Tests
 *
 * Tests the consolidated filter building service for:
 * - Organization validation and resolution
 * - Filter format conversions
 * - Type-safe filter building
 * - Fail-closed security
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type FilterBuilderService, createFilterBuilderService } from '@/lib/services/filters/filter-builder-service';
import type { UniversalChartFilters } from '@/lib/types/filters';
import type { UserContext } from '@/lib/types/rbac';

// Mock dependencies
vi.mock('@/lib/services/organization-access-service');
vi.mock('@/lib/services/organization-hierarchy-service');
vi.mock('@/lib/logger');

describe('FilterBuilderService', () => {
  let userContext: UserContext;
  let filterBuilder: FilterBuilderService;

  beforeEach(() => {
    // Minimal UserContext for testing filter conversions (not organization resolution)
    userContext = {} as UserContext;
    filterBuilder = createFilterBuilderService(userContext);
  });

  describe('toChartFilterArray', () => {
    it('should convert date range to ChartFilter array', () => {
      const input: UniversalChartFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      };

      const result = filterBuilder.toChartFilterArray(input);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ field: 'date', operator: 'gte', value: '2024-01-01' });
      expect(result[1]).toEqual({ field: 'date', operator: 'lte', value: '2024-12-31' });
    });

    it('should convert practiceUids to ChartFilter', () => {
      const input: UniversalChartFilters = {
        practiceUids: [100, 101, 102],
      };

      const result = filterBuilder.toChartFilterArray(input);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        field: 'practice_uid',
        operator: 'in',
        value: [100, 101, 102],
      });
    });

    it('should skip empty practiceUids array', () => {
      const input: UniversalChartFilters = {
        practiceUids: [],
      };

      const result = filterBuilder.toChartFilterArray(input);

      expect(result).toHaveLength(0);
    });

    it('should convert measure and frequency', () => {
      const input: UniversalChartFilters = {
        measure: 'Charges',
        frequency: 'Monthly',
      };

      const result = filterBuilder.toChartFilterArray(input);

      expect(result).toHaveLength(2);
      expect(result).toContainEqual({ field: 'measure', operator: 'eq', value: 'Charges' });
      expect(result).toContainEqual({ field: 'frequency', operator: 'eq', value: 'Monthly' });
    });

    it('should include advancedFilters', () => {
      const input: UniversalChartFilters = {
        startDate: '2024-01-01',
        advancedFilters: [
          { field: 'location', operator: 'eq', value: 'downtown' },
        ],
      };

      const result = filterBuilder.toChartFilterArray(input);

      expect(result).toHaveLength(2); // date + advanced filter
      expect(result).toContainEqual({ field: 'date', operator: 'gte', value: '2024-01-01' });
      expect(result).toContainEqual({ field: 'location', operator: 'eq', value: 'downtown' });
    });
  });

  describe('fromChartFilterArray', () => {
    it('should convert date filters to UniversalChartFilters', () => {
      const input = [
        { field: 'date', operator: 'gte' as const, value: '2024-01-01' },
        { field: 'date', operator: 'lte' as const, value: '2024-12-31' },
      ];

      const result = filterBuilder.fromChartFilterArray(input, 'test');

      expect(result.startDate).toBe('2024-01-01');
      expect(result.endDate).toBe('2024-12-31');
    });

    it('should convert practice_uid filter', () => {
      const input = [
        { field: 'practice_uid', operator: 'in' as const, value: [100, 101] },
      ];

      const result = filterBuilder.fromChartFilterArray(input, 'test');

      expect(result.practiceUids).toEqual([100, 101]);
    });

    it('should convert measure and frequency', () => {
      const input = [
        { field: 'measure', operator: 'eq' as const, value: 'Charges' },
        { field: 'frequency', operator: 'eq' as const, value: 'Monthly' },
      ];

      const result = filterBuilder.fromChartFilterArray(input, 'test');

      expect(result.measure).toBe('Charges');
      expect(result.frequency).toBe('Monthly');
    });

    it('should put unknown filters into advancedFilters', () => {
      const input = [
        { field: 'location', operator: 'eq' as const, value: 'downtown' },
        { field: 'custom_field', operator: 'neq' as const, value: 'test' },
      ];

      const result = filterBuilder.fromChartFilterArray(input, 'test');

      expect(result.advancedFilters).toHaveLength(2);
      expect(result.advancedFilters).toContainEqual({ field: 'location', operator: 'eq', value: 'downtown' });
    });
  });

  describe('mergeFilters', () => {
    it('should override chart filters with universal filters', () => {
      const universal: UniversalChartFilters = {
        startDate: '2024-06-01',
        endDate: '2024-12-31',
      };

      const chart: Partial<UniversalChartFilters> = {
        startDate: '2024-01-01',
        endDate: '2024-03-31',
        measure: 'Charges',
      };

      const result = filterBuilder.mergeFilters(universal, chart);

      expect(result.startDate).toBe('2024-06-01'); // Universal wins
      expect(result.endDate).toBe('2024-12-31'); // Universal wins
      expect(result.measure).toBe('Charges'); // From chart
    });

    it('should merge advancedFilters arrays', () => {
      const universal: UniversalChartFilters = {
        advancedFilters: [
          { field: 'location', operator: 'eq', value: 'downtown' },
        ],
      };

      const chart: Partial<UniversalChartFilters> = {
        advancedFilters: [
          { field: 'status', operator: 'eq', value: 'active' },
        ],
      };

      const result = filterBuilder.mergeFilters(universal, chart);

      expect(result.advancedFilters).toHaveLength(2);
      expect(result.advancedFilters).toContainEqual({ field: 'location', operator: 'eq', value: 'downtown' });
      expect(result.advancedFilters).toContainEqual({ field: 'status', operator: 'eq', value: 'active' });
    });
  });
});

