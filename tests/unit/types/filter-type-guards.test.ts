/**
 * Filter Type Guards Unit Tests
 *
 * Tests type guard functions for UniversalChartFilters
 */

import { describe, it, expect } from 'vitest';
import {
  hasOrganizationFilter,
  hasPracticeUidsFilter,
  hasDateRangeFilter,
  hasDateRangePreset,
  type UniversalChartFilters,
} from '@/lib/types/filters';

describe('Filter Type Guards', () => {
  describe('hasOrganizationFilter', () => {
    it('should return true when organizationId is present', () => {
      const filters: UniversalChartFilters = {
        organizationId: 'org-123',
      };

      expect(hasOrganizationFilter(filters)).toBe(true);
      
      if (hasOrganizationFilter(filters)) {
        // TypeScript should narrow the type
        expect(filters.organizationId).toBe('org-123');
      }
    });

    it('should return false when organizationId is missing', () => {
      const filters: UniversalChartFilters = {};
      expect(hasOrganizationFilter(filters)).toBe(false);
    });

    it('should return false when organizationId is empty string', () => {
      const filters: UniversalChartFilters = {
        organizationId: '',
      };
      expect(hasOrganizationFilter(filters)).toBe(false);
    });
  });

  describe('hasPracticeUidsFilter', () => {
    it('should return true when practiceUids has values', () => {
      const filters: UniversalChartFilters = {
        practiceUids: [100, 101],
      };

      expect(hasPracticeUidsFilter(filters)).toBe(true);
      
      if (hasPracticeUidsFilter(filters)) {
        expect(filters.practiceUids.length).toBe(2);
      }
    });

    it('should return false when practiceUids is empty array', () => {
      const filters: UniversalChartFilters = {
        practiceUids: [],
      };
      expect(hasPracticeUidsFilter(filters)).toBe(false);
    });

    it('should return false when practiceUids is undefined', () => {
      const filters: UniversalChartFilters = {};
      expect(hasPracticeUidsFilter(filters)).toBe(false);
    });
  });

  describe('hasDateRangeFilter', () => {
    it('should return true when both dates are present', () => {
      const filters: UniversalChartFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      };

      expect(hasDateRangeFilter(filters)).toBe(true);
      
      if (hasDateRangeFilter(filters)) {
        expect(filters.startDate).toBe('2024-01-01');
        expect(filters.endDate).toBe('2024-12-31');
      }
    });

    it('should return false when only startDate present', () => {
      const filters: UniversalChartFilters = {
        startDate: '2024-01-01',
      };
      expect(hasDateRangeFilter(filters)).toBe(false);
    });

    it('should return false when only endDate present', () => {
      const filters: UniversalChartFilters = {
        endDate: '2024-12-31',
      };
      expect(hasDateRangeFilter(filters)).toBe(false);
    });
  });

  describe('hasDateRangePreset', () => {
    it('should return true when dateRangePreset is present', () => {
      const filters: UniversalChartFilters = {
        dateRangePreset: 'last_30_days',
      };

      expect(hasDateRangePreset(filters)).toBe(true);
      
      if (hasDateRangePreset(filters)) {
        expect(filters.dateRangePreset).toBe('last_30_days');
      }
    });

    it('should return false when dateRangePreset is undefined', () => {
      const filters: UniversalChartFilters = {};
      expect(hasDateRangePreset(filters)).toBe(false);
    });

    it('should return false when dateRangePreset is empty string', () => {
      const filters: UniversalChartFilters = {
        dateRangePreset: '',
      };
      expect(hasDateRangePreset(filters)).toBe(false);
    });
  });
});

