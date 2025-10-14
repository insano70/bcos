/**
 * Unit tests for DateFormatter
 */

import { describe, it, expect } from 'vitest';
import {
  formatDateLabel,
  toChartJsDate,
  toMMDDYYYY,
  createCategoryLabel,
} from '@/lib/utils/chart-data/formatters/date-formatter';

describe('DateFormatter', () => {
  describe('formatDateLabel', () => {
    it('should format weekly dates', () => {
      const result = formatDateLabel('2024-01-15', 'Weekly');
      expect(result).toBe('Jan 15');
    });

    it('should format monthly dates', () => {
      const result = formatDateLabel('2024-01-01', 'Monthly');
      expect(result).toBe('Jan 2024');
    });

    it('should format quarterly dates', () => {
      const result = formatDateLabel('2024-01-01', 'Quarterly');
      expect(result).toBe('Q1 2024');
    });

    it('should format Q2 correctly', () => {
      const result = formatDateLabel('2024-04-01', 'Quarterly');
      expect(result).toBe('Q2 2024');
    });

    it('should format Q3 correctly', () => {
      const result = formatDateLabel('2024-07-01', 'Quarterly');
      expect(result).toBe('Q3 2024');
    });

    it('should format Q4 correctly', () => {
      const result = formatDateLabel('2024-10-01', 'Quarterly');
      expect(result).toBe('Q4 2024');
    });

    it('should return original string for unknown frequency', () => {
      const result = formatDateLabel('2024-01-01', 'Unknown');
      expect(result).toBe('2024-01-01');
    });
  });

  describe('toChartJsDate', () => {
    it('should keep weekly dates as-is', () => {
      const result = toChartJsDate('2024-01-15', 'Weekly');
      expect(result.getUTCDate()).toBe(15);
      expect(result.getUTCMonth()).toBe(0); // January
      expect(result.getUTCFullYear()).toBe(2024);
    });

    it('should convert monthly dates to first of month', () => {
      const result = toChartJsDate('2024-01-15', 'Monthly');
      expect(result.getUTCDate()).toBe(1); // First day of month
      expect(result.getUTCMonth()).toBe(0); // January
      expect(result.getUTCFullYear()).toBe(2024);
    });

    it('should convert quarterly dates to first of month', () => {
      const result = toChartJsDate('2024-04-15', 'Quarterly');
      expect(result.getUTCDate()).toBe(1); // First day of month
      expect(result.getUTCMonth()).toBe(3); // April
      expect(result.getUTCFullYear()).toBe(2024);
    });
  });

  describe('toMMDDYYYY', () => {
    it('should format date as MM-DD-YYYY', () => {
      const result = toMMDDYYYY('2024-01-05');
      expect(result).toBe('01-05-2024');
    });

    it('should pad single digit month and day', () => {
      const result = toMMDDYYYY('2024-03-09');
      expect(result).toBe('03-09-2024');
    });

    it('should handle end of year', () => {
      const result = toMMDDYYYY('2024-12-31');
      expect(result).toBe('12-31-2024');
    });
  });

  describe('createCategoryLabel', () => {
    it('should create quarterly labels', () => {
      const result = createCategoryLabel('2024-01-01', 'Quarterly');
      expect(result).toBe('Q1 2024');
    });

    it('should create monthly labels', () => {
      const result = createCategoryLabel('2024-06-15', 'Monthly');
      expect(result).toBe('Jun 2024');
    });

    it('should create weekly labels', () => {
      const result = createCategoryLabel('2024-06-15', 'Weekly');
      expect(result).toBe('Jun 15');
    });

    it('should return original for unknown frequency', () => {
      const result = createCategoryLabel('2024-01-01', 'Daily');
      expect(result).toBe('2024-01-01');
    });
  });
});

