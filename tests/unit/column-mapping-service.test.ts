/**
 * Unit Tests for ColumnMappingService
 *
 * Tests column mapping resolution and caching behavior
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chartConfigService } from '@/lib/services/chart-config-service';
import { ColumnMappingService } from '@/lib/services/column-mapping-service';

// Mock the chart config service
vi.mock('@/lib/services/chart-config-service', () => ({
  chartConfigService: {
    getDataSourceConfigById: vi.fn(),
  },
}));

describe('ColumnMappingService', () => {
  let service: ColumnMappingService;

  beforeEach(() => {
    service = new ColumnMappingService();
    vi.clearAllMocks();
  });

  describe('getMapping()', () => {
    it('should resolve column mapping for Data Source 1', async () => {
      // Mock config for DS1 (original schema)
      vi.mocked(chartConfigService.getDataSourceConfigById).mockResolvedValue({
        id: 1,
        name: 'Original Data Source',
        tableName: 'ih.agg_app_measures',
        schemaName: 'ih',
        dataSourceType: 'measure-based',
        isActive: true,
        columns: [
          {
            id: 1,
            columnName: 'date_index',
            isDateField: true,
            isTimePeriod: false,
            isMeasure: false,
            isDimension: true,
            displayName: 'Date',
            dataType: 'date',
            isFilterable: true,
            isGroupable: false,
            sortOrder: 1,
          },
          {
            id: 2,
            columnName: 'measure_value',
            isDateField: false,
            isTimePeriod: false,
            isMeasure: true,
            isDimension: false,
            displayName: 'Value',
            dataType: 'numeric',
            isFilterable: false,
            isGroupable: false,
            sortOrder: 2,
          },
          {
            id: 3,
            columnName: 'measure_type',
            isDateField: false,
            isTimePeriod: false,
            isMeasure: false,
            isDimension: true,
            isMeasureType: true,
            displayName: 'Type',
            dataType: 'text',
            isFilterable: true,
            isGroupable: false,
            sortOrder: 3,
          },
          {
            id: 4,
            columnName: 'frequency',
            isDateField: false,
            isTimePeriod: true,
            isMeasure: false,
            isDimension: true,
            displayName: 'Frequency',
            dataType: 'text',
            isFilterable: true,
            isGroupable: true,
            sortOrder: 4,
          },
          {
            id: 5,
            columnName: 'practice_uid',
            isDateField: false,
            isTimePeriod: false,
            isMeasure: false,
            isDimension: true,
            displayName: 'Practice',
            dataType: 'integer',
            isFilterable: true,
            isGroupable: true,
            sortOrder: 5,
          },
          {
            id: 6,
            columnName: 'provider_uid',
            isDateField: false,
            isTimePeriod: false,
            isMeasure: false,
            isDimension: true,
            displayName: 'Provider',
            dataType: 'integer',
            isFilterable: true,
            isGroupable: true,
            sortOrder: 6,
          },
        ],
      });

      const mapping = await service.getMapping(1);

      expect(mapping).toEqual({
        dateField: 'date_index',
        measureField: 'measure_value',
        measureTypeField: 'measure_type',
        timePeriodField: 'frequency',
        practiceField: 'practice_uid',
        providerField: 'provider_uid',
      });
    });

    it('should resolve column mapping for Data Source 3', async () => {
      // Mock config for DS3 (new schema)
      vi.mocked(chartConfigService.getDataSourceConfigById).mockResolvedValue({
        id: 3,
        name: 'App Measures with Entities',
        tableName: 'ih.agg_chart_data',
        schemaName: 'ih',
        dataSourceType: 'measure-based',
        isActive: true,
        columns: [
          {
            id: 1,
            columnName: 'date_value',
            isDateField: true,
            isTimePeriod: false,
            isMeasure: false,
            isDimension: true,
            displayName: 'Date',
            dataType: 'date',
            isFilterable: true,
            isGroupable: false,
            sortOrder: 1,
          },
          {
            id: 2,
            columnName: 'numeric_value',
            isDateField: false,
            isTimePeriod: false,
            isMeasure: true,
            isDimension: false,
            displayName: 'Value',
            dataType: 'numeric',
            isFilterable: false,
            isGroupable: false,
            sortOrder: 2,
          },
          {
            id: 3,
            columnName: 'measure_type',
            isDateField: false,
            isTimePeriod: false,
            isMeasure: false,
            isDimension: true,
            isMeasureType: true,
            displayName: 'Type',
            dataType: 'text',
            isFilterable: true,
            isGroupable: false,
            sortOrder: 3,
          },
          {
            id: 4,
            columnName: 'time_period',
            isDateField: true,
            isTimePeriod: true,
            isMeasure: false,
            isDimension: true,
            displayName: 'Period',
            dataType: 'text',
            isFilterable: true,
            isGroupable: true,
            sortOrder: 4,
          },
          {
            id: 5,
            columnName: 'practice_uid',
            isDateField: false,
            isTimePeriod: false,
            isMeasure: false,
            isDimension: true,
            displayName: 'Practice',
            dataType: 'integer',
            isFilterable: true,
            isGroupable: true,
            sortOrder: 5,
          },
          {
            id: 6,
            columnName: 'provider_uid',
            isDateField: false,
            isTimePeriod: false,
            isMeasure: false,
            isDimension: true,
            displayName: 'Provider',
            dataType: 'integer',
            isFilterable: true,
            isGroupable: true,
            sortOrder: 6,
          },
        ],
      });

      const mapping = await service.getMapping(3);

      expect(mapping).toEqual({
        dateField: 'date_value',
        measureField: 'numeric_value',
        measureTypeField: 'measure_type',
        timePeriodField: 'time_period',
        practiceField: 'practice_uid',
        providerField: 'provider_uid',
      });
    });

    it('should throw error for non-existent data source', async () => {
      vi.mocked(chartConfigService.getDataSourceConfigById).mockResolvedValue(null);

      await expect(service.getMapping(999)).rejects.toThrow('Data source 999 not found');
    });

    it('should throw error for missing required date column', async () => {
      vi.mocked(chartConfigService.getDataSourceConfigById).mockResolvedValue({
        id: 1,
        name: 'Incomplete Data Source',
        tableName: 'test',
        schemaName: 'test',
        dataSourceType: 'measure-based',
        isActive: true,
        columns: [
          // Missing date field!
          {
            id: 2,
            columnName: 'measure_value',
            isDateField: false,
            isTimePeriod: false,
            isMeasure: true,
            isDimension: false,
            displayName: 'Value',
            dataType: 'numeric',
            isFilterable: false,
            isGroupable: false,
            sortOrder: 1,
          },
        ],
      });

      await expect(service.getMapping(1)).rejects.toThrow(
        'Required column type "date" not found in data source 1'
      );
    });
  });

  describe('Caching', () => {
    it('should cache mapping after first load', async () => {
      vi.mocked(chartConfigService.getDataSourceConfigById).mockResolvedValue({
        id: 1,
        name: 'Test',
        tableName: 'test',
        schemaName: 'test',
        dataSourceType: 'measure-based',
        isActive: true,
        columns: [
          {
            id: 1,
            columnName: 'date_index',
            isDateField: true,
            isTimePeriod: false,
            isMeasure: false,
            isDimension: true,
            displayName: 'Date',
            dataType: 'date',
            isFilterable: true,
            isGroupable: false,
            sortOrder: 1,
          },
          {
            id: 2,
            columnName: 'measure_value',
            isDateField: false,
            isTimePeriod: false,
            isMeasure: true,
            isDimension: false,
            displayName: 'Value',
            dataType: 'numeric',
            isFilterable: false,
            isGroupable: false,
            sortOrder: 2,
          },
          {
            id: 3,
            columnName: 'measure_type',
            isDateField: false,
            isTimePeriod: false,
            isMeasure: false,
            isDimension: true,
            displayName: 'Type',
            dataType: 'text',
            isFilterable: true,
            isGroupable: false,
            sortOrder: 3,
          },
          {
            id: 4,
            columnName: 'frequency',
            isDateField: false,
            isTimePeriod: true,
            isMeasure: false,
            isDimension: true,
            displayName: 'Frequency',
            dataType: 'text',
            isFilterable: true,
            isGroupable: true,
            sortOrder: 4,
          },
        ],
      });

      // First call - should load from config
      await service.getMapping(1);
      expect(chartConfigService.getDataSourceConfigById).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      await service.getMapping(1);
      expect(chartConfigService.getDataSourceConfigById).toHaveBeenCalledTimes(1); // Still 1

      // Third call - should use cache
      await service.getMapping(1);
      expect(chartConfigService.getDataSourceConfigById).toHaveBeenCalledTimes(1); // Still 1
    });

    it('should maintain separate cache entries for different data sources', async () => {
      const mockDS1 = {
        id: 1,
        name: 'DS1',
        tableName: 'test',
        schemaName: 'test',
        dataSourceType: 'measure-based' as const,
        isActive: true,
        columns: [
          {
            id: 1,
            columnName: 'date_index',
            isDateField: true,
            isTimePeriod: false,
            isMeasure: false,
            isDimension: true,
            displayName: 'Date',
            dataType: 'date',
            isFilterable: true,
            isGroupable: false,
            sortOrder: 1,
          },
          {
            id: 2,
            columnName: 'measure_value',
            isDateField: false,
            isTimePeriod: false,
            isMeasure: true,
            isDimension: false,
            displayName: 'Value',
            dataType: 'numeric',
            isFilterable: false,
            isGroupable: false,
            sortOrder: 2,
          },
          {
            id: 3,
            columnName: 'measure_type',
            isDateField: false,
            isTimePeriod: false,
            isMeasure: false,
            isDimension: true,
            displayName: 'Type',
            dataType: 'text',
            isFilterable: true,
            isGroupable: false,
            sortOrder: 3,
          },
          {
            id: 4,
            columnName: 'frequency',
            isDateField: false,
            isTimePeriod: true,
            isMeasure: false,
            isDimension: true,
            displayName: 'Frequency',
            dataType: 'text',
            isFilterable: true,
            isGroupable: true,
            sortOrder: 4,
          },
        ],
      };

      const mockDS3 = {
        id: 3,
        name: 'DS3',
        tableName: 'test',
        schemaName: 'test',
        dataSourceType: 'measure-based' as const,
        isActive: true,
        columns: [
          {
            id: 1,
            columnName: 'date_value',
            isDateField: true,
            isTimePeriod: false,
            isMeasure: false,
            isDimension: true,
            displayName: 'Date',
            dataType: 'date',
            isFilterable: true,
            isGroupable: false,
            sortOrder: 1,
          },
          {
            id: 2,
            columnName: 'numeric_value',
            isDateField: false,
            isTimePeriod: false,
            isMeasure: true,
            isDimension: false,
            displayName: 'Value',
            dataType: 'numeric',
            isFilterable: false,
            isGroupable: false,
            sortOrder: 2,
          },
          {
            id: 3,
            columnName: 'measure_type',
            isDateField: false,
            isTimePeriod: false,
            isMeasure: false,
            isDimension: true,
            displayName: 'Type',
            dataType: 'text',
            isFilterable: true,
            isGroupable: false,
            sortOrder: 3,
          },
          {
            id: 4,
            columnName: 'time_period',
            isDateField: false,
            isTimePeriod: true,
            isMeasure: false,
            isDimension: true,
            displayName: 'Period',
            dataType: 'text',
            isFilterable: true,
            isGroupable: true,
            sortOrder: 4,
          },
        ],
      };

      vi.mocked(chartConfigService.getDataSourceConfigById).mockImplementation(async (id) => {
        if (id === 1) return mockDS1;
        if (id === 3) return mockDS3;
        return null;
      });

      const mapping1 = await service.getMapping(1);
      const mapping3 = await service.getMapping(3);

      expect(mapping1.dateField).toBe('date_index');
      expect(mapping3.dateField).toBe('date_value');
      expect(mapping1.measureField).toBe('measure_value');
      expect(mapping3.measureField).toBe('numeric_value');
    });
  });

  describe('invalidate()', () => {
    it('should clear cache for specific data source', async () => {
      vi.mocked(chartConfigService.getDataSourceConfigById).mockResolvedValue({
        id: 1,
        name: 'Test',
        tableName: 'test',
        schemaName: 'test',
        dataSourceType: 'measure-based',
        isActive: true,
        columns: [
          {
            id: 1,
            columnName: 'date_index',
            isDateField: true,
            isTimePeriod: false,
            isMeasure: false,
            isDimension: true,
            displayName: 'Date',
            dataType: 'date',
            isFilterable: true,
            isGroupable: false,
            sortOrder: 1,
          },
          {
            id: 2,
            columnName: 'measure_value',
            isDateField: false,
            isTimePeriod: false,
            isMeasure: true,
            isDimension: false,
            displayName: 'Value',
            dataType: 'numeric',
            isFilterable: false,
            isGroupable: false,
            sortOrder: 2,
          },
          {
            id: 3,
            columnName: 'measure_type',
            isDateField: false,
            isTimePeriod: false,
            isMeasure: false,
            isDimension: true,
            displayName: 'Type',
            dataType: 'text',
            isFilterable: true,
            isGroupable: false,
            sortOrder: 3,
          },
          {
            id: 4,
            columnName: 'frequency',
            isDateField: false,
            isTimePeriod: true,
            isMeasure: false,
            isDimension: true,
            displayName: 'Frequency',
            dataType: 'text',
            isFilterable: true,
            isGroupable: true,
            sortOrder: 4,
          },
        ],
      });

      await service.getMapping(1);
      expect(chartConfigService.getDataSourceConfigById).toHaveBeenCalledTimes(1);

      service.invalidate(1);

      await service.getMapping(1);
      expect(chartConfigService.getDataSourceConfigById).toHaveBeenCalledTimes(2); // Reloaded
    });

    it('should clear all cache entries when no ID provided', async () => {
      vi.mocked(chartConfigService.getDataSourceConfigById).mockResolvedValue({
        id: 1,
        name: 'Test',
        tableName: 'test',
        schemaName: 'test',
        dataSourceType: 'measure-based',
        isActive: true,
        columns: [
          {
            id: 1,
            columnName: 'date_index',
            isDateField: true,
            isTimePeriod: false,
            isMeasure: false,
            isDimension: true,
            displayName: 'Date',
            dataType: 'date',
            isFilterable: true,
            isGroupable: false,
            sortOrder: 1,
          },
          {
            id: 2,
            columnName: 'measure_value',
            isDateField: false,
            isTimePeriod: false,
            isMeasure: true,
            isDimension: false,
            displayName: 'Value',
            dataType: 'numeric',
            isFilterable: false,
            isGroupable: false,
            sortOrder: 2,
          },
          {
            id: 3,
            columnName: 'measure_type',
            isDateField: false,
            isTimePeriod: false,
            isMeasure: false,
            isDimension: true,
            displayName: 'Type',
            dataType: 'text',
            isFilterable: true,
            isGroupable: false,
            sortOrder: 3,
          },
          {
            id: 4,
            columnName: 'frequency',
            isDateField: false,
            isTimePeriod: true,
            isMeasure: false,
            isDimension: true,
            displayName: 'Frequency',
            dataType: 'text',
            isFilterable: true,
            isGroupable: true,
            sortOrder: 4,
          },
        ],
      });

      await service.getMapping(1);
      await service.getMapping(3);

      service.invalidate(); // Clear all

      await service.getMapping(1);
      await service.getMapping(3);

      expect(chartConfigService.getDataSourceConfigById).toHaveBeenCalledTimes(4); // All reloaded
    });
  });

  describe('createAccessor()', () => {
    it('should create MeasureAccessor with correct mapping', async () => {
      vi.mocked(chartConfigService.getDataSourceConfigById).mockResolvedValue({
        id: 1,
        name: 'Test',
        tableName: 'test',
        schemaName: 'test',
        dataSourceType: 'measure-based',
        isActive: true,
        columns: [
          {
            id: 1,
            columnName: 'date_index',
            isDateField: true,
            isTimePeriod: false,
            isMeasure: false,
            isDimension: true,
            displayName: 'Date',
            dataType: 'date',
            isFilterable: true,
            isGroupable: false,
            sortOrder: 1,
          },
          {
            id: 2,
            columnName: 'measure_value',
            isDateField: false,
            isTimePeriod: false,
            isMeasure: true,
            isDimension: false,
            displayName: 'Value',
            dataType: 'numeric',
            isFilterable: false,
            isGroupable: false,
            sortOrder: 2,
          },
          {
            id: 3,
            columnName: 'measure_type',
            isDateField: false,
            isTimePeriod: false,
            isMeasure: false,
            isDimension: true,
            displayName: 'Type',
            dataType: 'text',
            isFilterable: true,
            isGroupable: false,
            sortOrder: 3,
          },
          {
            id: 4,
            columnName: 'frequency',
            isDateField: false,
            isTimePeriod: true,
            isMeasure: false,
            isDimension: true,
            displayName: 'Frequency',
            dataType: 'text',
            isFilterable: true,
            isGroupable: true,
            sortOrder: 4,
          },
        ],
      });

      const row = {
        date_index: '2025-01-01',
        measure_value: 100,
        measure_type: 'currency',
        frequency: 'Monthly',
      };

      const accessor = await service.createAccessor(row, 1);

      expect(accessor.getDate()).toBe('2025-01-01');
      expect(accessor.getMeasureValue()).toBe(100);
      expect(accessor.getMeasureType()).toBe('currency');
      expect(accessor.getTimePeriod()).toBe('Monthly');
    });
  });

  describe('createAccessors()', () => {
    it('should create multiple accessors efficiently', async () => {
      vi.mocked(chartConfigService.getDataSourceConfigById).mockResolvedValue({
        id: 1,
        name: 'Test',
        tableName: 'test',
        schemaName: 'test',
        dataSourceType: 'measure-based',
        isActive: true,
        columns: [
          {
            id: 1,
            columnName: 'date_index',
            isDateField: true,
            isTimePeriod: false,
            isMeasure: false,
            isDimension: true,
            displayName: 'Date',
            dataType: 'date',
            isFilterable: true,
            isGroupable: false,
            sortOrder: 1,
          },
          {
            id: 2,
            columnName: 'measure_value',
            isDateField: false,
            isTimePeriod: false,
            isMeasure: true,
            isDimension: false,
            displayName: 'Value',
            dataType: 'numeric',
            isFilterable: false,
            isGroupable: false,
            sortOrder: 2,
          },
          {
            id: 3,
            columnName: 'measure_type',
            isDateField: false,
            isTimePeriod: false,
            isMeasure: false,
            isDimension: true,
            displayName: 'Type',
            dataType: 'text',
            isFilterable: true,
            isGroupable: false,
            sortOrder: 3,
          },
          {
            id: 4,
            columnName: 'frequency',
            isDateField: false,
            isTimePeriod: true,
            isMeasure: false,
            isDimension: true,
            displayName: 'Frequency',
            dataType: 'text',
            isFilterable: true,
            isGroupable: true,
            sortOrder: 4,
          },
        ],
      });

      const rows = [
        {
          date_index: '2025-01-01',
          measure_value: 100,
          measure_type: 'currency',
          frequency: 'Monthly',
        },
        {
          date_index: '2025-02-01',
          measure_value: 200,
          measure_type: 'currency',
          frequency: 'Monthly',
        },
        {
          date_index: '2025-03-01',
          measure_value: 300,
          measure_type: 'currency',
          frequency: 'Monthly',
        },
      ];

      const accessors = await service.createAccessors(rows, 1);

      expect(accessors).toHaveLength(3);
      expect(accessors[0]?.getMeasureValue()).toBe(100);
      expect(accessors[1]?.getMeasureValue()).toBe(200);
      expect(accessors[2]?.getMeasureValue()).toBe(300);

      // Should only load mapping once
      expect(chartConfigService.getDataSourceConfigById).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCacheStats()', () => {
    it('should return cache statistics', async () => {
      vi.mocked(chartConfigService.getDataSourceConfigById).mockResolvedValue({
        id: 1,
        name: 'Test',
        tableName: 'test',
        schemaName: 'test',
        dataSourceType: 'measure-based',
        isActive: true,
        columns: [
          {
            id: 1,
            columnName: 'date_index',
            isDateField: true,
            isTimePeriod: false,
            isMeasure: false,
            isDimension: true,
            displayName: 'Date',
            dataType: 'date',
            isFilterable: true,
            isGroupable: false,
            sortOrder: 1,
          },
          {
            id: 2,
            columnName: 'measure_value',
            isDateField: false,
            isTimePeriod: false,
            isMeasure: true,
            isDimension: false,
            displayName: 'Value',
            dataType: 'numeric',
            isFilterable: false,
            isGroupable: false,
            sortOrder: 2,
          },
          {
            id: 3,
            columnName: 'measure_type',
            isDateField: false,
            isTimePeriod: false,
            isMeasure: false,
            isDimension: true,
            displayName: 'Type',
            dataType: 'text',
            isFilterable: true,
            isGroupable: false,
            sortOrder: 3,
          },
          {
            id: 4,
            columnName: 'frequency',
            isDateField: false,
            isTimePeriod: true,
            isMeasure: false,
            isDimension: true,
            displayName: 'Frequency',
            dataType: 'text',
            isFilterable: true,
            isGroupable: true,
            sortOrder: 4,
          },
        ],
      });

      const statsBefore = service.getCacheStats();
      expect(statsBefore.size).toBe(0);
      expect(statsBefore.dataSourceIds).toEqual([]);

      await service.getMapping(1);
      await service.getMapping(3);

      const statsAfter = service.getCacheStats();
      expect(statsAfter.size).toBe(2);
      expect(statsAfter.dataSourceIds).toContain(1);
      expect(statsAfter.dataSourceIds).toContain(3);
    });
  });
});
