/**
 * Unit Tests for MeasureAccessor
 * 
 * Tests dynamic column access for multiple data sources with different schemas
 */

import { describe, it, expect } from 'vitest';
import { MeasureAccessor, type AggAppMeasure, type DataSourceColumnMapping } from '@/lib/types/analytics';

describe('MeasureAccessor', () => {
  describe('Data Source 1 (Original Schema)', () => {
    const mapping: DataSourceColumnMapping = {
      dateField: 'date_index',
      measureField: 'measure_value',
      measureTypeField: 'measure_type',
      timePeriodField: 'frequency',
      practiceField: 'practice_uid',
      providerField: 'provider_uid',
    };

    const row: AggAppMeasure = {
      date_index: '2025-01-15',
      measure_value: 12500.50,
      measure_type: 'currency',
      frequency: 'Monthly',
      practice_uid: 42,
      provider_uid: 100,
    };

    it('should access date field correctly', () => {
      const accessor = new MeasureAccessor(row, mapping);
      expect(accessor.getDate()).toBe('2025-01-15');
    });

    it('should access measure value correctly', () => {
      const accessor = new MeasureAccessor(row, mapping);
      expect(accessor.getMeasureValue()).toBe(12500.50);
    });

    it('should access measure type correctly', () => {
      const accessor = new MeasureAccessor(row, mapping);
      expect(accessor.getMeasureType()).toBe('currency');
    });

    it('should access time period correctly', () => {
      const accessor = new MeasureAccessor(row, mapping);
      expect(accessor.getTimePeriod()).toBe('Monthly');
    });

    it('should access practice UID correctly', () => {
      const accessor = new MeasureAccessor(row, mapping);
      expect(accessor.getPracticeUid()).toBe(42);
    });

    it('should access provider UID correctly', () => {
      const accessor = new MeasureAccessor(row, mapping);
      expect(accessor.getProviderUid()).toBe(100);
    });
  });

  describe('Data Source 3 (New Schema)', () => {
    const mapping: DataSourceColumnMapping = {
      dateField: 'date_value',
      measureField: 'numeric_value',
      measureTypeField: 'measure_type',
      timePeriodField: 'time_period',
      practiceField: 'practice_uid',
      providerField: 'provider_uid',
    };

    const row: AggAppMeasure = {
      date_value: '2025-03-01',
      numeric_value: 9876.25,
      measure_type: 'count',
      time_period: 'Weekly',
      practice_uid: 99,
      provider_uid: 200,
    };

    it('should access date field with different column name', () => {
      const accessor = new MeasureAccessor(row, mapping);
      expect(accessor.getDate()).toBe('2025-03-01');
    });

    it('should access measure value with different column name', () => {
      const accessor = new MeasureAccessor(row, mapping);
      expect(accessor.getMeasureValue()).toBe(9876.25);
    });

    it('should access measure type correctly', () => {
      const accessor = new MeasureAccessor(row, mapping);
      expect(accessor.getMeasureType()).toBe('count');
    });

    it('should access time period with different column name', () => {
      const accessor = new MeasureAccessor(row, mapping);
      expect(accessor.getTimePeriod()).toBe('Weekly');
    });

    it('should access practice UID correctly', () => {
      const accessor = new MeasureAccessor(row, mapping);
      expect(accessor.getPracticeUid()).toBe(99);
    });

    it('should access provider UID correctly', () => {
      const accessor = new MeasureAccessor(row, mapping);
      expect(accessor.getProviderUid()).toBe(200);
    });
  });

  describe('Type Coercion', () => {
    it('should parse string measure values to numbers', () => {
      const mapping: DataSourceColumnMapping = {
        dateField: 'date',
        measureField: 'value',
        measureTypeField: 'type',
        timePeriodField: 'period',
      };

      const row: AggAppMeasure = {
        date: '2025-01-01',
        value: '12345.67',  // String value
        type: 'currency',
        period: 'Monthly',
      };

      const accessor = new MeasureAccessor(row, mapping);
      expect(accessor.getMeasureValue()).toBe(12345.67);
      expect(typeof accessor.getMeasureValue()).toBe('number');
    });

    it('should parse string practice UID to number', () => {
      const mapping: DataSourceColumnMapping = {
        dateField: 'date',
        measureField: 'value',
        measureTypeField: 'type',
        timePeriodField: 'period',
        practiceField: 'practice_uid',
      };

      const row: AggAppMeasure = {
        date: '2025-01-01',
        value: 100,
        type: 'currency',
        period: 'Monthly',
        practice_uid: '42',  // String UID
      };

      const accessor = new MeasureAccessor(row, mapping);
      expect(accessor.getPracticeUid()).toBe(42);
      expect(typeof accessor.getPracticeUid()).toBe('number');
    });

    it('should return default measure type when missing', () => {
      const mapping: DataSourceColumnMapping = {
        dateField: 'date',
        measureField: 'value',
        measureTypeField: 'type',
        timePeriodField: 'period',
      };

      const row: AggAppMeasure = {
        date: '2025-01-01',
        value: 100,
        // type is missing
        period: 'Monthly',
      };

      const accessor = new MeasureAccessor(row, mapping);
      expect(accessor.getMeasureType()).toBe('number');  // Default fallback
    });
  });

  describe('Generic Field Access', () => {
    it('should access any field via get() method', () => {
      const mapping: DataSourceColumnMapping = {
        dateField: 'date',
        measureField: 'value',
        measureTypeField: 'type',
        timePeriodField: 'period',
      };

      const row: AggAppMeasure = {
        date: '2025-01-01',
        value: 100,
        type: 'currency',
        period: 'Monthly',
        custom_field: 'Custom Value',
        another_field: 999,
      };

      const accessor = new MeasureAccessor(row, mapping);
      expect(accessor.get('custom_field')).toBe('Custom Value');
      expect(accessor.get('another_field')).toBe(999);
    });

    it('should return undefined for non-existent fields', () => {
      const mapping: DataSourceColumnMapping = {
        dateField: 'date',
        measureField: 'value',
        measureTypeField: 'type',
        timePeriodField: 'period',
      };

      const row: AggAppMeasure = {
        date: '2025-01-01',
        value: 100,
        type: 'currency',
        period: 'Monthly',
      };

      const accessor = new MeasureAccessor(row, mapping);
      expect(accessor.get('nonexistent')).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    const mapping: DataSourceColumnMapping = {
      dateField: 'date',
      measureField: 'value',
      measureTypeField: 'type',
      timePeriodField: 'period',
    };

    it('should throw error when date field is not a string', () => {
      const row: AggAppMeasure = {
        date: 12345,  // Number instead of string
        value: 100,
        type: 'currency',
        period: 'Monthly',
      };

      const accessor = new MeasureAccessor(row, mapping);
      expect(() => accessor.getDate()).toThrow('Date field "date" is not a string');
    });

    it('should throw error when measure field is invalid', () => {
      const row: AggAppMeasure = {
        date: '2025-01-01',
        value: 'not a number',  // Invalid measure value
        type: 'currency',
        period: 'Monthly',
      };

      const accessor = new MeasureAccessor(row, mapping);
      expect(() => accessor.getMeasureValue()).toThrow('Measure field "value" is not a number');
    });
  });

  describe('getRaw()', () => {
    it('should return underlying row data', () => {
      const mapping: DataSourceColumnMapping = {
        dateField: 'date',
        measureField: 'value',
        measureTypeField: 'type',
        timePeriodField: 'period',
      };

      const row: AggAppMeasure = {
        date: '2025-01-01',
        value: 100,
        type: 'currency',
        period: 'Monthly',
      };

      const accessor = new MeasureAccessor(row, mapping);
      expect(accessor.getRaw()).toBe(row);
      expect(accessor.getRaw()).toEqual(row);
    });
  });

  describe('Optional Fields', () => {
    it('should return undefined for missing practice UID', () => {
      const mapping: DataSourceColumnMapping = {
        dateField: 'date',
        measureField: 'value',
        measureTypeField: 'type',
        timePeriodField: 'period',
      };

      const row: AggAppMeasure = {
        date: '2025-01-01',
        value: 100,
        type: 'currency',
        period: 'Monthly',
        // No practice_uid
      };

      const accessor = new MeasureAccessor(row, mapping);
      expect(accessor.getPracticeUid()).toBeUndefined();
    });

    it('should return undefined for missing provider UID', () => {
      const mapping: DataSourceColumnMapping = {
        dateField: 'date',
        measureField: 'value',
        measureTypeField: 'type',
        timePeriodField: 'period',
      };

      const row: AggAppMeasure = {
        date: '2025-01-01',
        value: 100,
        type: 'currency',
        period: 'Monthly',
        // No provider_uid
      };

      const accessor = new MeasureAccessor(row, mapping);
      expect(accessor.getProviderUid()).toBeUndefined();
    });

    it('should return undefined for missing time period', () => {
      const mapping: DataSourceColumnMapping = {
        dateField: 'date',
        measureField: 'value',
        measureTypeField: 'type',
        timePeriodField: 'period',
      };

      const row: AggAppMeasure = {
        date: '2025-01-01',
        value: 100,
        type: 'currency',
        // No period
      };

      const accessor = new MeasureAccessor(row, mapping);
      expect(accessor.getTimePeriod()).toBeUndefined();
    });
  });
});

