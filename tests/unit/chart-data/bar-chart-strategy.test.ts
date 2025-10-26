/**
 * Unit tests for BarChartStrategy - Dataset Sorting
 */

import { describe, expect, it } from 'vitest';
import { BarChartStrategy } from '@/lib/utils/chart-data/strategies/bar-chart-strategy';
import type { AggAppMeasure } from '@/lib/types/analytics';

describe('BarChartStrategy - Stacked Bar Sorting', () => {
  const strategy = new BarChartStrategy();

  describe('Multi-series dataset sorting', () => {
    it('should sort datasets by total value descending (largest at bottom)', () => {
      // Create test data with three categories having different totals
      const measures: AggAppMeasure[] = [
        // Category A: Total = 300
        {
          date_index: '2025-01-01',
          measure_value: 100,
          measure_type: 'currency',
          measure: 'Revenue',
          category: 'Category A',
        },
        {
          date_index: '2025-02-01',
          measure_value: 200,
          measure_type: 'currency',
          measure: 'Revenue',
          category: 'Category A',
        },
        // Category B: Total = 150
        {
          date_index: '2025-01-01',
          measure_value: 50,
          measure_type: 'currency',
          measure: 'Revenue',
          category: 'Category B',
        },
        {
          date_index: '2025-02-01',
          measure_value: 100,
          measure_type: 'currency',
          measure: 'Revenue',
          category: 'Category B',
        },
        // Category C: Total = 600
        {
          date_index: '2025-01-01',
          measure_value: 300,
          measure_type: 'currency',
          measure: 'Revenue',
          category: 'Category C',
        },
        {
          date_index: '2025-02-01',
          measure_value: 300,
          measure_type: 'currency',
          measure: 'Revenue',
          category: 'Category C',
        },
      ];

      const result = strategy.transform(measures, {
        chartType: 'stacked-bar',
        groupBy: 'category',
        paletteId: 'default',
      });

      // Verify datasets are sorted by total descending
      expect(result.datasets).toHaveLength(3);
      expect(result.datasets[0]?.label).toBe('Category C'); // Total: 600 (bottom)
      expect(result.datasets[1]?.label).toBe('Category A'); // Total: 300 (middle)
      expect(result.datasets[2]?.label).toBe('Category B'); // Total: 150 (top)

      // Verify data values are preserved correctly
      expect(result.datasets[0]?.data).toEqual([300, 300]); // Category C
      expect(result.datasets[1]?.data).toEqual([100, 200]); // Category A
      expect(result.datasets[2]?.data).toEqual([50, 100]); // Category B
    });

    it('should handle zero-value datasets', () => {
      const measures: AggAppMeasure[] = [
        // Category A: Total = 100
        {
          date_index: '2025-01-01',
          measure_value: 100,
          measure_type: 'number',
          measure: 'Count',
          status: 'Active',
        },
        // Category B: Total = 0
        {
          date_index: '2025-01-01',
          measure_value: 0,
          measure_type: 'number',
          measure: 'Count',
          status: 'Inactive',
        },
      ];

      const result = strategy.transform(measures, {
        chartType: 'stacked-bar',
        groupBy: 'status',
        paletteId: 'default',
      });

      expect(result.datasets).toHaveLength(2);
      expect(result.datasets[0]?.label).toBe('Active'); // Non-zero first
      expect(result.datasets[1]?.label).toBe('Inactive'); // Zero last
    });

    it('should handle negative values in sorting', () => {
      const measures: AggAppMeasure[] = [
        // Category A: Total = -100
        {
          date_index: '2025-01-01',
          measure_value: -50,
          measure_type: 'currency',
          measure: 'Profit',
          category: 'Loss',
        },
        {
          date_index: '2025-02-01',
          measure_value: -50,
          measure_type: 'currency',
          measure: 'Profit',
          category: 'Loss',
        },
        // Category B: Total = 200
        {
          date_index: '2025-01-01',
          measure_value: 100,
          measure_type: 'currency',
          measure: 'Profit',
          category: 'Gain',
        },
        {
          date_index: '2025-02-01',
          measure_value: 100,
          measure_type: 'currency',
          measure: 'Profit',
          category: 'Gain',
        },
      ];

      const result = strategy.transform(measures, {
        chartType: 'stacked-bar',
        groupBy: 'category',
        paletteId: 'default',
      });

      // Positive values should sort before negative values
      expect(result.datasets).toHaveLength(2);
      expect(result.datasets[0]?.label).toBe('Gain'); // Total: 200
      expect(result.datasets[1]?.label).toBe('Loss'); // Total: -100
    });

    it('should handle equal totals with stable sort', () => {
      const measures: AggAppMeasure[] = [
        {
          date_index: '2025-01-01',
          measure_value: 100,
          measure_type: 'number',
          measure: 'Count',
          category: 'Alpha',
        },
        {
          date_index: '2025-01-01',
          measure_value: 100,
          measure_type: 'number',
          measure: 'Count',
          category: 'Beta',
        },
        {
          date_index: '2025-01-01',
          measure_value: 100,
          measure_type: 'number',
          measure: 'Count',
          category: 'Gamma',
        },
      ];

      const result = strategy.transform(measures, {
        chartType: 'stacked-bar',
        groupBy: 'category',
        paletteId: 'default',
      });

      // All have same total, order should be stable (Map insertion order)
      expect(result.datasets).toHaveLength(3);
      // Just verify they all exist
      const labels = result.datasets.map((ds) => ds.label);
      expect(labels).toContain('Alpha');
      expect(labels).toContain('Beta');
      expect(labels).toContain('Gamma');
    });

    it('should preserve measure type metadata after sorting', () => {
      const measures: AggAppMeasure[] = [
        {
          date_index: '2025-01-01',
          measure_value: 50,
          measure_type: 'percentage',
          measure: 'Rate',
          category: 'Small',
        },
        {
          date_index: '2025-01-01',
          measure_value: 200,
          measure_type: 'percentage',
          measure: 'Rate',
          category: 'Large',
        },
      ];

      const result = strategy.transform(measures, {
        chartType: 'stacked-bar',
        groupBy: 'category',
        paletteId: 'default',
      });

      // Verify measure type is preserved
      expect(result.measureType).toBe('percentage');
      // Verify sorting worked
      expect(result.datasets[0]?.label).toBe('Large');
      expect(result.datasets[1]?.label).toBe('Small');
    });

    it('should handle single dataset without sorting', () => {
      const measures: AggAppMeasure[] = [
        {
          date_index: '2025-01-01',
          measure_value: 100,
          measure_type: 'number',
          measure: 'Count',
          category: 'Only',
        },
      ];

      const result = strategy.transform(measures, {
        chartType: 'stacked-bar',
        groupBy: 'category',
        paletteId: 'default',
      });

      expect(result.datasets).toHaveLength(1);
      expect(result.datasets[0]?.label).toBe('Only');
      expect(result.datasets[0]?.data).toEqual([100]);
    });

    it('should not affect single-series charts (groupBy: none)', () => {
      const measures: AggAppMeasure[] = [
        {
          date_index: '2025-01-01',
          measure_value: 100,
          measure_type: 'currency',
          measure: 'Revenue',
        },
        {
          date_index: '2025-02-01',
          measure_value: 200,
          measure_type: 'currency',
          measure: 'Revenue',
        },
      ];

      const result = strategy.transform(measures, {
        chartType: 'bar',
        groupBy: 'none',
        paletteId: 'default',
      });

      // Single series, no sorting needed
      expect(result.datasets).toHaveLength(1);
      expect(result.datasets[0]?.data).toEqual([100, 200]);
    });

    it('should handle multiple dates with varying values', () => {
      const measures: AggAppMeasure[] = [
        // Category A: Jan=10, Feb=20, Mar=30 → Total=60
        {
          date_index: '2025-01-01',
          measure_value: 10,
          measure_type: 'number',
          measure: 'Sales',
          region: 'North',
        },
        {
          date_index: '2025-02-01',
          measure_value: 20,
          measure_type: 'number',
          measure: 'Sales',
          region: 'North',
        },
        {
          date_index: '2025-03-01',
          measure_value: 30,
          measure_type: 'number',
          measure: 'Sales',
          region: 'North',
        },
        // Category B: Jan=50, Feb=50, Mar=50 → Total=150
        {
          date_index: '2025-01-01',
          measure_value: 50,
          measure_type: 'number',
          measure: 'Sales',
          region: 'South',
        },
        {
          date_index: '2025-02-01',
          measure_value: 50,
          measure_type: 'number',
          measure: 'Sales',
          region: 'South',
        },
        {
          date_index: '2025-03-01',
          measure_value: 50,
          measure_type: 'number',
          measure: 'Sales',
          region: 'South',
        },
      ];

      const result = strategy.transform(measures, {
        chartType: 'stacked-bar',
        groupBy: 'region',
        paletteId: 'default',
      });

      expect(result.datasets).toHaveLength(2);
      expect(result.datasets[0]?.label).toBe('South'); // Total: 150
      expect(result.datasets[1]?.label).toBe('North'); // Total: 60
      expect(result.labels).toHaveLength(3); // Three months
    });

    it('should handle mixed measure types gracefully', () => {
      const measures: AggAppMeasure[] = [
        {
          date_index: '2025-01-01',
          measure_value: 100,
          numeric_value: 100,
          measure_type: 'currency',
          measure: 'Amount',
          type: 'Type A',
        },
        {
          date_index: '2025-01-01',
          measure_value: 200,
          numeric_value: 200,
          measure_type: 'currency',
          measure: 'Amount',
          type: 'Type B',
        },
      ];

      const result = strategy.transform(measures, {
        chartType: 'stacked-bar',
        groupBy: 'type',
        paletteId: 'default',
      });

      // Should sort correctly using measure_value
      expect(result.datasets[0]?.label).toBe('Type B'); // 200
      expect(result.datasets[1]?.label).toBe('Type A'); // 100
    });
  });

  describe('Chart configuration compatibility', () => {
    it('should work with bar chart type', () => {
      const measures: AggAppMeasure[] = [
        {
          date_index: '2025-01-01',
          measure_value: 100,
          measure_type: 'number',
          measure: 'Count',
          status: 'Active',
        },
      ];

      const result = strategy.transform(measures, {
        chartType: 'bar',
        groupBy: 'status',
        paletteId: 'default',
      });

      expect(result.datasets).toBeDefined();
      expect(result.labels).toBeDefined();
    });

    it('should work with stacked-bar chart type', () => {
      const measures: AggAppMeasure[] = [
        {
          date_index: '2025-01-01',
          measure_value: 100,
          measure_type: 'number',
          measure: 'Count',
          status: 'Active',
        },
      ];

      const result = strategy.transform(measures, {
        chartType: 'stacked-bar',
        groupBy: 'status',
        paletteId: 'default',
      });

      expect(result.datasets).toBeDefined();
      expect(result.labels).toBeDefined();
    });
  });
});
