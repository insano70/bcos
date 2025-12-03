/**
 * Drill-Down Executor Tests
 *
 * Tests for the drill-down execution logic.
 * Verifies all three drill-down types: filter, navigate, swap.
 */

import { describe, it, expect } from 'vitest';
import {
  executeDrillDown,
  buildDrillDownConfig,
  validateDrillDownConfig,
} from '@/lib/services/drill-down/drill-down-executor';
import type { ChartClickContext, DrillDownConfig } from '@/lib/types/drill-down';

describe('drill-down-executor', () => {
  // Test data - single series click context
  const mockClickContext: ChartClickContext = {
    fieldName: 'provider_name',
    fieldValue: 'Dr. Smith',
    datasetLabel: 'Revenue',
    clickPosition: { x: 100, y: 200 },
    dataIndex: 0,
    datasetIndex: 0,
  };

  // Multi-series click context (e.g., Revenue by Provider over Time)
  // Uses a formatted date label that will be skipped in favor of series filter
  const mockMultiSeriesClickContext: ChartClickContext = {
    fieldName: 'date',
    fieldValue: 'Jan 2025', // Formatted date - will be skipped
    seriesFieldName: 'provider_name',
    seriesFieldValue: 'Dr. Smith',
    datasetLabel: 'Dr. Smith',
    clickPosition: { x: 150, y: 250 },
    dataIndex: 0,
    datasetIndex: 1,
  };
  
  // Multi-series click context with non-date primary field
  const mockMultiSeriesNonDateContext: ChartClickContext = {
    fieldName: 'category',
    fieldValue: 'Infusions',
    seriesFieldName: 'provider_name',
    seriesFieldValue: 'Dr. Smith',
    datasetLabel: 'Dr. Smith',
    clickPosition: { x: 150, y: 250 },
    dataIndex: 0,
    datasetIndex: 1,
  };

  describe('executeDrillDown', () => {
    describe('filter type', () => {
      it('returns filter result with single filter from click context', () => {
        const config: DrillDownConfig = {
          enabled: true,
          type: 'filter',
          targetChartId: null,
          buttonLabel: 'Filter Chart',
        };

        const result = executeDrillDown(config, mockClickContext);

        expect(result).toEqual({
          type: 'filter',
          filters: [
            {
              field: 'provider_name',
              value: 'Dr. Smith',
            },
          ],
        });
      });

      it('returns filter result with only series filter when primary is formatted date', () => {
        const config: DrillDownConfig = {
          enabled: true,
          type: 'filter',
          targetChartId: null,
          buttonLabel: 'Filter Chart',
        };

        const result = executeDrillDown(config, mockMultiSeriesClickContext);

        // Formatted date labels are skipped, only series filter is returned
        expect(result).toEqual({
          type: 'filter',
          filters: [
            { field: 'provider_name', value: 'Dr. Smith' },
          ],
        });
      });

      it('returns filter result with both filters when primary is not a formatted date', () => {
        const config: DrillDownConfig = {
          enabled: true,
          type: 'filter',
          targetChartId: null,
          buttonLabel: 'Filter Chart',
        };

        const result = executeDrillDown(config, mockMultiSeriesNonDateContext);

        expect(result).toEqual({
          type: 'filter',
          filters: [
            { field: 'category', value: 'Infusions' },
            { field: 'provider_name', value: 'Dr. Smith' },
          ],
        });
      });
    });

    describe('navigate type', () => {
      it('returns navigate result with target chart and single filter', () => {
        const config: DrillDownConfig = {
          enabled: true,
          type: 'navigate',
          targetChartId: 'chart-123',
          buttonLabel: 'View Details',
        };

        const result = executeDrillDown(config, mockClickContext);

        expect(result).toEqual({
          type: 'navigate',
          targetChartId: 'chart-123',
          targetFilters: [
            {
              field: 'provider_name',
              value: 'Dr. Smith',
            },
          ],
        });
      });

      it('returns navigate result with only series filter when primary is formatted date', () => {
        const config: DrillDownConfig = {
          enabled: true,
          type: 'navigate',
          targetChartId: 'chart-123',
          buttonLabel: 'View Details',
        };

        const result = executeDrillDown(config, mockMultiSeriesClickContext);

        // Formatted date labels are skipped, only series filter is returned
        expect(result).toEqual({
          type: 'navigate',
          targetChartId: 'chart-123',
          targetFilters: [
            { field: 'provider_name', value: 'Dr. Smith' },
          ],
        });
      });

      it('returns null if target chart is missing', () => {
        const config: DrillDownConfig = {
          enabled: true,
          type: 'navigate',
          targetChartId: null,
          buttonLabel: 'View Details',
        };

        const result = executeDrillDown(config, mockClickContext);

        expect(result).toBeNull();
      });
    });

    describe('swap type', () => {
      it('returns swap result with target chart only', () => {
        const config: DrillDownConfig = {
          enabled: true,
          type: 'swap',
          targetChartId: 'chart-456',
          buttonLabel: 'Swap Chart',
        };

        const result = executeDrillDown(config, mockClickContext);

        expect(result).toEqual({
          type: 'swap',
          targetChartId: 'chart-456',
        });
      });

      it('returns null if target chart is missing', () => {
        const config: DrillDownConfig = {
          enabled: true,
          type: 'swap',
          targetChartId: null,
          buttonLabel: 'Swap Chart',
        };

        const result = executeDrillDown(config, mockClickContext);

        expect(result).toBeNull();
      });
    });

    describe('disabled config', () => {
      it('returns null when drill-down is disabled', () => {
        const config: DrillDownConfig = {
          enabled: false,
          type: 'filter',
          targetChartId: null,
          buttonLabel: 'Drill Down',
        };

        const result = executeDrillDown(config, mockClickContext);

        expect(result).toBeNull();
      });
    });

    describe('invalid inputs', () => {
      it('returns null when type is null', () => {
        const config: DrillDownConfig = {
          enabled: true,
          type: null,
          targetChartId: null,
          buttonLabel: 'Drill Down',
        };

        const result = executeDrillDown(config, mockClickContext);

        expect(result).toBeNull();
      });

      it('returns null when click context has no field name', () => {
        const config: DrillDownConfig = {
          enabled: true,
          type: 'filter',
          targetChartId: null,
          buttonLabel: 'Drill Down',
        };

        const invalidContext = {
          ...mockClickContext,
          fieldName: '',
        };

        const result = executeDrillDown(config, invalidContext);

        expect(result).toBeNull();
      });
    });
  });

  describe('buildDrillDownConfig', () => {
    it('builds config from chart definition fields', () => {
      const chartDef = {
        drill_down_enabled: true,
        drill_down_type: 'navigate',
        drill_down_target_chart_id: 'chart-789',
        drill_down_button_label: 'View More',
      };

      const result = buildDrillDownConfig(chartDef);

      expect(result).toEqual({
        enabled: true,
        type: 'navigate',
        targetChartId: 'chart-789',
        buttonLabel: 'View More',
      });
    });

    it('uses defaults for missing/null fields', () => {
      const chartDef = {
        drill_down_enabled: null,
        drill_down_type: null,
        drill_down_target_chart_id: null,
        drill_down_button_label: null,
      };

      const result = buildDrillDownConfig(chartDef);

      expect(result).toEqual({
        enabled: false,
        type: null,
        targetChartId: null,
        buttonLabel: 'Drill Down',
      });
    });

    it('handles undefined fields', () => {
      const chartDef = {};

      const result = buildDrillDownConfig(chartDef);

      expect(result).toEqual({
        enabled: false,
        type: null,
        targetChartId: null,
        buttonLabel: 'Drill Down',
      });
    });
  });

  describe('validateDrillDownConfig', () => {
    it('returns null for valid filter config', () => {
      const config: DrillDownConfig = {
        enabled: true,
        type: 'filter',
        targetChartId: null,
        buttonLabel: 'Filter',
      };

      const error = validateDrillDownConfig(config);

      expect(error).toBeNull();
    });

    it('returns null for valid navigate config', () => {
      const config: DrillDownConfig = {
        enabled: true,
        type: 'navigate',
        targetChartId: 'chart-123',
        buttonLabel: 'View',
      };

      const error = validateDrillDownConfig(config);

      expect(error).toBeNull();
    });

    it('returns null for valid swap config', () => {
      const config: DrillDownConfig = {
        enabled: true,
        type: 'swap',
        targetChartId: 'chart-456',
        buttonLabel: 'Swap',
      };

      const error = validateDrillDownConfig(config);

      expect(error).toBeNull();
    });

    it('returns null for disabled config', () => {
      const config: DrillDownConfig = {
        enabled: false,
        type: null,
        targetChartId: null,
        buttonLabel: 'Drill Down',
      };

      const error = validateDrillDownConfig(config);

      expect(error).toBeNull();
    });

    it('returns error when type is missing but enabled', () => {
      const config: DrillDownConfig = {
        enabled: true,
        type: null,
        targetChartId: null,
        buttonLabel: 'Drill Down',
      };

      const error = validateDrillDownConfig(config);

      expect(error).toBe('Drill-down type is required when enabled');
    });

    it('returns error when navigate has no target chart', () => {
      const config: DrillDownConfig = {
        enabled: true,
        type: 'navigate',
        targetChartId: null,
        buttonLabel: 'Navigate',
      };

      const error = validateDrillDownConfig(config);

      expect(error).toBe('Target chart is required for navigate drill-down type');
    });

    it('returns error when swap has no target chart', () => {
      const config: DrillDownConfig = {
        enabled: true,
        type: 'swap',
        targetChartId: null,
        buttonLabel: 'Swap',
      };

      const error = validateDrillDownConfig(config);

      expect(error).toBe('Target chart is required for swap drill-down type');
    });
  });
});

