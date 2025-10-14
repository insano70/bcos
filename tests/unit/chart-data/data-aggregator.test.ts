/**
 * Unit tests for DataAggregator
 */

import { describe, it, expect } from 'vitest';
import type { AggAppMeasure } from '@/lib/types/analytics';
import {
  groupByFieldAndDate,
  groupBySeriesAndDate,
  aggregateAcrossDates,
  applyAggregation,
  extractAndSortDates,
  filterDatesWithData,
  getGroupValue,
} from '@/lib/utils/chart-data/services/data-aggregator';

describe('DataAggregator', () => {
  describe('groupByFieldAndDate', () => {
    it('should group measures by field and date', () => {
      const measures: AggAppMeasure[] = [
        { date_index: '2024-01-01', measure_value: 100, measure_type: 'currency', provider_name: 'Dr. Smith' },
        { date_index: '2024-01-01', measure_value: 200, measure_type: 'currency', provider_name: 'Dr. Jones' },
        { date_index: '2024-01-02', measure_value: 150, measure_type: 'currency', provider_name: 'Dr. Smith' },
      ];

      const result = groupByFieldAndDate(measures, 'provider_name');

      expect(result.size).toBe(2);
      expect(result.get('Dr. Smith')?.size).toBe(2);
      expect(result.get('Dr. Jones')?.size).toBe(1);
      expect(result.get('Dr. Smith')?.get('2024-01-01')).toEqual([100]);
      expect(result.get('Dr. Jones')?.get('2024-01-01')).toEqual([200]);
    });

    it('should handle string measure values', () => {
      const measures: AggAppMeasure[] = [
        { date_index: '2024-01-01', measure_value: '100' as unknown as number, measure_type: 'currency', provider_name: 'Dr. Smith' },
      ];

      const result = groupByFieldAndDate(measures, 'provider_name');

      expect(result.get('Dr. Smith')?.get('2024-01-01')).toEqual([100]);
    });
  });

  describe('groupBySeriesAndDate', () => {
    it('should group measures by series label', () => {
      const measures: AggAppMeasure[] = [
        { date_index: '2024-01-01', measure_value: 100, measure_type: 'currency', series_label: 'Current' },
        { date_index: '2024-01-01', measure_value: 90, measure_type: 'currency', series_label: 'Previous' },
        { date_index: '2024-01-02', measure_value: 110, measure_type: 'currency', series_label: 'Current' },
      ];

      const result = groupBySeriesAndDate(measures);

      expect(result.size).toBe(2);
      expect(result.get('Current')?.get('2024-01-01')).toEqual([100]);
      expect(result.get('Previous')?.get('2024-01-01')).toEqual([90]);
    });

    it('should use measure as fallback for series label', () => {
      const measures: AggAppMeasure[] = [
        { date_index: '2024-01-01', measure_value: 100, measure_type: 'currency', measure: 'Charges' },
      ];

      const result = groupBySeriesAndDate(measures);

      expect(result.has('Charges')).toBe(true);
    });
  });

  describe('aggregateAcrossDates', () => {
    it('should sum values across dates', () => {
      const measures: AggAppMeasure[] = [
        { date_index: '2024-01-01', measure_value: 100, measure_type: 'currency', provider_name: 'Dr. Smith' },
        { date_index: '2024-01-02', measure_value: 150, measure_type: 'currency', provider_name: 'Dr. Smith' },
        { date_index: '2024-01-01', measure_value: 200, measure_type: 'currency', provider_name: 'Dr. Jones' },
      ];

      const result = aggregateAcrossDates(measures, 'provider_name', 'sum');

      expect(result.get('Dr. Smith')).toBe(250);
      expect(result.get('Dr. Jones')).toBe(200);
    });

    it('should count occurrences', () => {
      const measures: AggAppMeasure[] = [
        { date_index: '2024-01-01', measure_value: 100, measure_type: 'currency', provider_name: 'Dr. Smith' },
        { date_index: '2024-01-02', measure_value: 150, measure_type: 'currency', provider_name: 'Dr. Smith' },
        { date_index: '2024-01-01', measure_value: 200, measure_type: 'currency', provider_name: 'Dr. Jones' },
      ];

      const result = aggregateAcrossDates(measures, 'provider_name', 'count');

      expect(result.get('Dr. Smith')).toBe(2);
      expect(result.get('Dr. Jones')).toBe(1);
    });
  });

  describe('applyAggregation', () => {
    it('should sum values', () => {
      expect(applyAggregation([10, 20, 30], 'sum')).toBe(60);
    });

    it('should calculate average', () => {
      expect(applyAggregation([10, 20, 30], 'avg')).toBe(20);
    });

    it('should count values', () => {
      expect(applyAggregation([10, 20, 30], 'count')).toBe(3);
    });

    it('should find minimum', () => {
      expect(applyAggregation([30, 10, 20], 'min')).toBe(10);
    });

    it('should find maximum', () => {
      expect(applyAggregation([30, 10, 20], 'max')).toBe(30);
    });

    it('should return 0 for empty array', () => {
      expect(applyAggregation([], 'sum')).toBe(0);
    });
  });

  describe('extractAndSortDates', () => {
    it('should extract unique dates and sort chronologically', () => {
      const measures: AggAppMeasure[] = [
        { date_index: '2024-01-03', measure_value: 100, measure_type: 'currency' },
        { date_index: '2024-01-01', measure_value: 200, measure_type: 'currency' },
        { date_index: '2024-01-02', measure_value: 150, measure_type: 'currency' },
        { date_index: '2024-01-01', measure_value: 100, measure_type: 'currency' }, // Duplicate
      ];

      const result = extractAndSortDates(measures);

      expect(result).toEqual(['2024-01-01', '2024-01-02', '2024-01-03']);
    });
  });

  describe('filterDatesWithData', () => {
    it('should filter out dates with no data', () => {
      const dates = ['2024-01-01', '2024-01-02', '2024-01-03'];
      const groupedData = new Map([
        ['Provider A', new Map([
          ['2024-01-01', [100]],
          ['2024-01-02', [0]],
          ['2024-01-03', [150]],
        ])],
      ]);

      const result = filterDatesWithData(dates, groupedData);

      expect(result).toEqual(['2024-01-01', '2024-01-03']);
    });

    it('should keep dates with any non-zero values', () => {
      const dates = ['2024-01-01', '2024-01-02'];
      const groupedData = new Map([
        ['Provider A', new Map([['2024-01-01', [0]]])],
        ['Provider B', new Map([['2024-01-01', [100]]])], // Has data
      ]);

      const result = filterDatesWithData(dates, groupedData);

      expect(result).toContain('2024-01-01');
    });
  });

  describe('getGroupValue', () => {
    it('should extract field value from measure', () => {
      const measure: AggAppMeasure = {
        date_index: '2024-01-01',
        measure_value: 100,
        measure_type: 'currency',
        provider_name: 'Dr. Smith',
      };

      expect(getGroupValue(measure, 'provider_name')).toBe('Dr. Smith');
    });

    it('should handle numeric values', () => {
      const measure: AggAppMeasure = {
        date_index: '2024-01-01',
        measure_value: 100,
        measure_type: 'currency',
        practice_uid: 123,
      };

      expect(getGroupValue(measure, 'practice_uid')).toBe('123');
    });

    it('should provide fallback for null values', () => {
      const measure: AggAppMeasure = {
        date_index: '2024-01-01',
        measure_value: 100,
        measure_type: 'currency',
      };

      const result = getGroupValue(measure, 'provider_name');
      expect(result).toBe('Unknown Provider Name');
    });

    it('should provide fallback for empty strings', () => {
      const measure: AggAppMeasure = {
        date_index: '2024-01-01',
        measure_value: 100,
        measure_type: 'currency',
        provider_name: '',
      };

      const result = getGroupValue(measure, 'provider_name');
      expect(result).toBe('Unknown Provider Name');
    });
  });
});

