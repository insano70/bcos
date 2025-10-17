/**
 * Unit tests for ValueFormatter
 */

import { describe, expect, it } from 'vitest';
import {
  formatValue,
  formatValueCompact,
  parseNumericValue,
} from '@/lib/utils/chart-data/formatters/value-formatter';

describe('ValueFormatter', () => {
  describe('formatValue', () => {
    it('should format currency values', () => {
      const result = formatValue(1234.56, 'currency');
      expect(result).toBe('$1,235'); // Rounded, no decimals
    });

    it('should format count values with commas', () => {
      const result = formatValue(1234567, 'count');
      expect(result).toBe('1,234,567');
    });

    it('should format percentage values', () => {
      const result = formatValue(45.67, 'percentage');
      expect(result).toBe('45.7%');
    });

    it('should format unknown types as string', () => {
      const result = formatValue(123.456, 'number');
      expect(result).toBe('123.456');
    });

    it('should handle zero values', () => {
      expect(formatValue(0, 'currency')).toBe('$0');
      expect(formatValue(0, 'count')).toBe('0');
      expect(formatValue(0, 'percentage')).toBe('0.0%');
    });

    it('should handle negative currency', () => {
      const result = formatValue(-1000, 'currency');
      expect(result).toBe('-$1,000');
    });
  });

  describe('formatValueCompact', () => {
    it('should format billions', () => {
      expect(formatValueCompact(5_000_000_000, 'count')).toBe('5B');
      expect(formatValueCompact(5_500_000_000, 'count')).toBe('5.5B');
    });

    it('should format millions', () => {
      expect(formatValueCompact(3_000_000, 'count')).toBe('3M');
      expect(formatValueCompact(3_200_000, 'count')).toBe('3.2M');
    });

    it('should format thousands', () => {
      expect(formatValueCompact(5_000, 'count')).toBe('5K');
      expect(formatValueCompact(5_400, 'count')).toBe('5.4K');
    });

    it('should not abbreviate small numbers', () => {
      expect(formatValueCompact(999, 'count')).toBe('999');
    });

    it('should add currency symbol for currency type', () => {
      expect(formatValueCompact(5_000_000, 'currency')).toBe('$5M');
      expect(formatValueCompact(5_000, 'currency')).toBe('$5K');
      expect(formatValueCompact(500, 'currency')).toBe('$500');
    });

    it('should handle negative values', () => {
      expect(formatValueCompact(-5_000_000, 'count')).toBe('-5M');
      expect(formatValueCompact(-3_000, 'currency')).toBe('$-3K');
    });

    it('should remove trailing .0', () => {
      expect(formatValueCompact(5_000_000, 'count')).toBe('5M'); // Not 5.0M
    });
  });

  describe('parseNumericValue', () => {
    it('should parse string numbers', () => {
      expect(parseNumericValue('123.45')).toBe(123.45);
    });

    it('should parse string integers', () => {
      expect(parseNumericValue('1000')).toBe(1000);
    });

    it('should return numeric values as-is', () => {
      expect(parseNumericValue(456.78)).toBe(456.78);
    });

    it('should handle zero', () => {
      expect(parseNumericValue('0')).toBe(0);
      expect(parseNumericValue(0)).toBe(0);
    });

    it('should handle negative numbers', () => {
      expect(parseNumericValue('-100')).toBe(-100);
      expect(parseNumericValue(-200)).toBe(-200);
    });
  });
});
