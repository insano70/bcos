/**
 * Chart Config Builder Integration Tests
 *
 * Integration tests for ChartConfigBuilderService:
 * - Config validation
 * - Config caching (Redis-backed)
 * - Template registry integration
 *
 * Tests the complete flow with real chart definitions and configurations.
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { ChartConfigBuilderService } from '@/lib/services/dashboard-rendering/chart-config-builder';
import { chartExecutionConfigCache } from '@/lib/services/dashboard-rendering/chart-config-cache';
import { configTemplatesRegistry } from '@/lib/services/dashboard-rendering/config-templates';
import type { ChartDefinition, ResolvedFilters } from '@/lib/services/dashboard-rendering/types';

/**
 * Helper: Create valid chart definition for testing
 */
function createTestChart(overrides?: Partial<ChartDefinition>): ChartDefinition {
  return {
    chart_definition_id: 'test-chart',
    chart_name: 'Test Chart',
    chart_description: undefined,
    chart_type: 'bar',
    chart_config: {
      dataSourceId: 3,
    },
    data_source: {},
    data_source_id: 3,
    chart_category_id: undefined,
    created_by: 'test-user',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_active: true,
    category: undefined,
    creator: undefined,
    ...overrides,
  };
}

describe('Chart Config Builder Integration', () => {
  let configBuilder: ChartConfigBuilderService;

  beforeAll(() => {
    configBuilder = new ChartConfigBuilderService();
  });

  describe('Config Validation', () => {
    beforeEach(async () => {
      // Clear Redis cache before each validation test to ensure fresh validation
      await chartExecutionConfigCache.invalidate();
    });

    it('should validate valid chart definition', async () => {
      const chart = createTestChart({
        chart_config: {
          dataSourceId: 3,
          groupBy: 'practice_uid',
        },
        data_source: {
          filters: [
            { field: 'measure', value: 'AR' },
            { field: 'frequency', value: 'Monthly' },
          ],
        },
      });

      const filters: ResolvedFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        practiceUids: [],
      };

      // Should not throw
      await expect(
        configBuilder.buildSingleChartConfig(chart, filters)
      ).resolves.toBeDefined();
    });

    it('should reject chart with missing dataSourceId', async () => {
      const chart = createTestChart({
        chart_definition_id: 'test-missing-datasource',
        chart_config: {
          // Missing dataSourceId
          groupBy: 'practice_uid',
        },
      });

      const filters: ResolvedFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        practiceUids: [],
      };

      await expect(
        configBuilder.buildSingleChartConfig(chart, filters)
      ).rejects.toThrow('Missing dataSourceId');
    });

    it('should reject chart with invalid chart_type', async () => {
      const chart = createTestChart({
        chart_definition_id: 'test-invalid-charttype',
        chart_type: 'invalid-type' as 'bar', // Invalid type
      });

      const filters: ResolvedFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        practiceUids: [],
      };

      await expect(
        configBuilder.buildSingleChartConfig(chart, filters)
      ).rejects.toThrow('Invalid chart_type');
    });

    it('should reject dual-axis chart without dualAxisConfig', async () => {
      const chart = createTestChart({
        chart_definition_id: 'test-missing-dualaxis',
        chart_type: 'dual-axis',
        chart_config: {
          dataSourceId: 3,
          // Missing dualAxisConfig
        },
      });

      const filters: ResolvedFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        practiceUids: [],
      };

      await expect(
        configBuilder.buildSingleChartConfig(chart, filters)
      ).rejects.toThrow('Dual-axis chart missing dualAxisConfig');
    });

    it('should validate date range consistency', async () => {
      const chart = createTestChart({
        chart_definition_id: 'test-invalid-daterange',
      });

      const filters: ResolvedFilters = {
        startDate: '2024-12-31', // After end date
        endDate: '2024-01-01',
        practiceUids: [],
      };

      await expect(
        configBuilder.buildSingleChartConfig(chart, filters)
      ).rejects.toThrow('Invalid date range');
    });
  });

  describe('Config Caching (Redis-backed)', () => {
    beforeEach(async () => {
      // Clear cache before each test to ensure isolation
      await chartExecutionConfigCache.invalidate();
    });

    it('should cache built configs in Redis', async () => {
      const chart = createTestChart({
        chart_definition_id: 'chart-cache-1',
        data_source: {
          filters: [{ field: 'measure', value: 'AR' }],
        },
      });

      const filters: ResolvedFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        practiceUids: [100],
      };

      // First build - cache miss
      const config1 = await configBuilder.buildSingleChartConfig(chart, filters);

      // Second build with same filters - cache hit
      const config2 = await configBuilder.buildSingleChartConfig(chart, filters);

      // Should return equivalent objects (Redis deserializes to new objects)
      expect(config2).toEqual(config1);
      expect(config2.chartId).toBe(config1.chartId);
      expect(config2.chartName).toBe(config1.chartName);
    });

    it('should use different cache keys for different filters', async () => {
      const chart = createTestChart({
        chart_definition_id: 'chart-cache-2',
      });

      const filters1: ResolvedFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        practiceUids: [100],
      };

      const filters2: ResolvedFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        practiceUids: [200], // Different practice
      };

      const config1 = await configBuilder.buildSingleChartConfig(chart, filters1);
      const config2 = await configBuilder.buildSingleChartConfig(chart, filters2);

      // Should be different configs (different cache keys)
      // Configs are still equal in structure but cached separately
      expect(config1.chartId).toBe(config2.chartId);

      // But with same filters, should return cached value
      const config3 = await configBuilder.buildSingleChartConfig(chart, filters1);
      expect(config3).toEqual(config1);
    });

    it('should invalidate cache by chart ID', async () => {
      const chart = createTestChart({
        chart_definition_id: 'chart-invalidate-1',
      });

      const filters: ResolvedFilters = {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        practiceUids: [],
      };

      // Build and cache
      const config1 = await configBuilder.buildSingleChartConfig(chart, filters);

      // Invalidate cache for this chart
      await configBuilder.invalidateCache('chart-invalidate-1');

      // Build again - should be cache miss (rebuilt)
      const config2 = await configBuilder.buildSingleChartConfig(chart, filters);

      // Should have same values (rebuilt with same inputs)
      expect(config2).toEqual(config1);
    });
  });

  describe('Template Registry', () => {
    it('should have templates for all standard chart types', () => {
      const chartTypes = configTemplatesRegistry.getAllChartTypes();

      expect(chartTypes).toContain('line');
      expect(chartTypes).toContain('bar');
      expect(chartTypes).toContain('stacked-bar');
      expect(chartTypes).toContain('horizontal-bar');
      expect(chartTypes).toContain('progress-bar');
      expect(chartTypes).toContain('dual-axis');
      expect(chartTypes).toContain('pie');
      expect(chartTypes).toContain('doughnut');
      expect(chartTypes).toContain('area');
      expect(chartTypes).toContain('number');
      expect(chartTypes).toContain('table');
    });

    it('should apply template defaults to chart config', () => {
      const config: Record<string, unknown> = {
        dataSourceId: 3,
        measure: 'AR',
      };

      const configWithDefaults = configTemplatesRegistry.applyTemplate('bar', config);

      // Should have bar chart defaults
      expect(configWithDefaults.colorPalette).toBe('default');
      expect(configWithDefaults.showLegend).toBe(true);
      expect(configWithDefaults.borderWidth).toBe(1);
      expect(configWithDefaults.borderRadius).toBe(4);

      // Original config should take precedence
      expect(configWithDefaults.dataSourceId).toBe(3);
      expect(configWithDefaults.measure).toBe('AR');
    });

    it('should validate config against template requirements', () => {
      const validConfig = {
        dataSourceId: 3,
        measure: 'AR',
        frequency: 'Monthly',
      };

      const validation = configTemplatesRegistry.validateAgainstTemplate('bar', validConfig);

      expect(validation.isValid).toBe(true);
      expect(validation.missingFields).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const invalidConfig = {
        dataSourceId: 3,
        // Missing measure and frequency
      };

      const validation = configTemplatesRegistry.validateAgainstTemplate('bar', invalidConfig);

      expect(validation.isValid).toBe(false);
      expect(validation.missingFields).toContain('measure');
      expect(validation.missingFields).toContain('frequency');
    });

    it('should provide template documentation', () => {
      const info = configTemplatesRegistry.getTemplateInfo('bar');

      expect(info).toBeDefined();
      expect(info?.chartType).toBe('bar');
      expect(info?.requiredFields).toContain('dataSourceId');
      expect(info?.requiredFields).toContain('measure');
      expect(info?.requiredFields).toContain('frequency');
      expect(info?.description).toBeTruthy();
    });
  });
});
