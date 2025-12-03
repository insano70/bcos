/**
 * Chart Click Handler Utility Tests
 *
 * Tests for creating Chart.js onClick handlers for drill-down functionality.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createChartClickHandler,
  getPrimaryFieldFromConfig,
  getSeriesFieldFromConfig,
  extractDatasetField,
} from '@/lib/utils/chart-click-handler';
import type { ChartClickContext } from '@/lib/types/drill-down';

describe('chart-click-handler', () => {
  describe('createChartClickHandler', () => {
    it('should call onElementClick with correct context when clicking a chart element', () => {
      const onElementClick = vi.fn();
      
      const handler = createChartClickHandler({
        onElementClick,
        primaryField: 'provider_name',
      });

      // Mock Chart.js event, elements, and chart
      const mockEvent = {
        native: { clientX: 100, clientY: 200 },
      };

      const mockElements = [
        { index: 0, datasetIndex: 0 },
      ];

      const mockChart = {
        data: {
          labels: ['Dr. Smith', 'Dr. Jones', 'Dr. Brown'],
          datasets: [{ label: 'Revenue', data: [100, 200, 300] }],
        },
      };

      handler(mockEvent as never, mockElements as never, mockChart as never);

      expect(onElementClick).toHaveBeenCalledTimes(1);
      expect(onElementClick).toHaveBeenCalledWith({
        fieldName: 'provider_name',
        fieldValue: 'Dr. Smith',
        clickPosition: { x: 100, y: 200 },
        dataIndex: 0,
        datasetIndex: 0,
        datasetLabel: 'Revenue',
      });
    });

    it('should use default "date" for primaryField if not provided', () => {
      const onElementClick = vi.fn();
      
      const handler = createChartClickHandler({
        onElementClick,
      });

      const mockEvent = { native: { clientX: 50, clientY: 100 } };
      const mockElements = [{ index: 1, datasetIndex: 0 }];
      const mockChart = {
        data: {
          labels: ['2024-01', '2024-02', '2024-03'],
          datasets: [{ label: 'Sales', data: [10, 20, 30] }],
        },
      };

      handler(mockEvent as never, mockElements as never, mockChart as never);

      expect(onElementClick).toHaveBeenCalledWith(
        expect.objectContaining({
          fieldName: 'date',
          fieldValue: '2024-02',
        })
      );
    });

    it('should not call onElementClick when no elements are clicked', () => {
      const onElementClick = vi.fn();
      
      const handler = createChartClickHandler({
        onElementClick,
        primaryField: 'test',
      });

      const mockEvent = { native: { clientX: 0, clientY: 0 } };
      const mockChart = {
        data: { labels: ['A'], datasets: [{ data: [1] }] },
      };

      // Empty elements array
      handler(mockEvent as never, [], mockChart as never);

      expect(onElementClick).not.toHaveBeenCalled();
    });

    it('should not call onElementClick when elements is null', () => {
      const onElementClick = vi.fn();
      
      const handler = createChartClickHandler({
        onElementClick,
        primaryField: 'test',
      });

      const mockEvent = { native: { clientX: 0, clientY: 0 } };
      const mockChart = {
        data: { labels: ['A'], datasets: [{ data: [1] }] },
      };

      handler(mockEvent as never, null as never, mockChart as never);

      expect(onElementClick).not.toHaveBeenCalled();
    });

    it('should not include datasetLabel when dataset has no label', () => {
      const onElementClick = vi.fn();
      
      const handler = createChartClickHandler({
        onElementClick,
        primaryField: 'category',
      });

      const mockEvent = { native: { clientX: 100, clientY: 200 } };
      const mockElements = [{ index: 0, datasetIndex: 0 }];
      const mockChart = {
        data: {
          labels: ['Category A'],
          datasets: [{ data: [100] }], // No label on dataset
        },
      };

      handler(mockEvent as never, mockElements as never, mockChart as never);

      const call = onElementClick.mock.calls[0]?.[0] as ChartClickContext | undefined;
      expect(call).toBeDefined();
      expect(call?.fieldName).toBe('category');
      expect(call && 'datasetLabel' in call).toBe(false);
    });

    it('should handle missing native event gracefully', () => {
      const onElementClick = vi.fn();
      
      const handler = createChartClickHandler({
        onElementClick,
        primaryField: 'test',
      });

      const mockEvent = {}; // No native event
      const mockElements = [{ index: 0, datasetIndex: 0 }];
      const mockChart = {
        data: { labels: ['A'], datasets: [{ label: 'X', data: [1] }] },
      };

      handler(mockEvent as never, mockElements as never, mockChart as never);

      expect(onElementClick).not.toHaveBeenCalled();
    });

    it('should include series field info for multi-series charts', () => {
      const onElementClick = vi.fn();
      
      const handler = createChartClickHandler({
        onElementClick,
        primaryField: 'date',
        seriesField: 'provider_name',
      });

      const mockEvent = { native: { clientX: 100, clientY: 200 } };
      const mockElements = [{ index: 0, datasetIndex: 1 }];
      const mockChart = {
        data: {
          labels: ['January', 'February', 'March'],
          datasets: [
            { label: 'Dr. Smith', data: [100, 200, 300] },
            { label: 'Dr. Jones', data: [150, 250, 350] },
          ],
        },
      };

      handler(mockEvent as never, mockElements as never, mockChart as never);

      expect(onElementClick).toHaveBeenCalledWith({
        fieldName: 'date',
        fieldValue: 'January',
        seriesFieldName: 'provider_name',
        seriesFieldValue: 'Dr. Jones',
        clickPosition: { x: 100, y: 200 },
        dataIndex: 0,
        datasetIndex: 1,
        datasetLabel: 'Dr. Jones',
      });
    });

    it('should not include series fields when seriesField is not provided', () => {
      const onElementClick = vi.fn();
      
      const handler = createChartClickHandler({
        onElementClick,
        primaryField: 'date',
        // No seriesField
      });

      const mockEvent = { native: { clientX: 100, clientY: 200 } };
      const mockElements = [{ index: 0, datasetIndex: 0 }];
      const mockChart = {
        data: {
          labels: ['January'],
          datasets: [{ label: 'Dr. Smith', data: [100] }],
        },
      };

      handler(mockEvent as never, mockElements as never, mockChart as never);

      const call = onElementClick.mock.calls[0]?.[0] as ChartClickContext | undefined;
      expect(call).toBeDefined();
      expect(call && 'seriesFieldName' in call).toBe(false);
      expect(call && 'seriesFieldValue' in call).toBe(false);
    });
  });

  describe('getPrimaryFieldFromConfig', () => {
    it('should return groupBy field when provided', () => {
      const result = getPrimaryFieldFromConfig({ groupBy: 'provider_name' });
      expect(result).toBe('provider_name');
    });

    it('should ignore groupBy when set to "none"', () => {
      const result = getPrimaryFieldFromConfig({ groupBy: 'none' });
      expect(result).toBe('date');
    });

    it('should use x_axis field when groupBy is not set', () => {
      const result = getPrimaryFieldFromConfig({ x_axis: { field: 'month' } });
      expect(result).toBe('month');
    });

    it('should default to "date" when no config provided', () => {
      const result = getPrimaryFieldFromConfig(null);
      expect(result).toBe('date');
    });

    it('should default to "date" when config is undefined', () => {
      const result = getPrimaryFieldFromConfig(undefined);
      expect(result).toBe('date');
    });

    it('should default to "date" when empty config provided', () => {
      const result = getPrimaryFieldFromConfig({});
      expect(result).toBe('date');
    });

    it('should prioritize groupBy over x_axis.field', () => {
      const result = getPrimaryFieldFromConfig({
        groupBy: 'location',
        x_axis: { field: 'month' },
      });
      expect(result).toBe('location');
    });
  });

  describe('getSeriesFieldFromConfig', () => {
    it('should return groupBy from seriesConfigs array', () => {
      const result = getSeriesFieldFromConfig({
        seriesConfigs: [{ groupBy: 'provider_name' }],
      });
      expect(result).toBe('provider_name');
    });

    it('should return groupBy from series object', () => {
      const result = getSeriesFieldFromConfig({
        series: { groupBy: 'location' },
      });
      expect(result).toBe('location');
    });

    it('should prioritize seriesConfigs over series', () => {
      const result = getSeriesFieldFromConfig({
        seriesConfigs: [{ groupBy: 'provider_name' }],
        series: { groupBy: 'location' },
      });
      expect(result).toBe('provider_name');
    });

    it('should return undefined when no series config', () => {
      const result = getSeriesFieldFromConfig({});
      expect(result).toBeUndefined();
    });

    it('should return undefined when seriesConfigs groupBy is "none"', () => {
      const result = getSeriesFieldFromConfig({
        seriesConfigs: [{ groupBy: 'none' }],
      });
      expect(result).toBeUndefined();
    });

    it('should return undefined when series.groupBy is "none"', () => {
      const result = getSeriesFieldFromConfig({
        series: { groupBy: 'none' },
      });
      expect(result).toBeUndefined();
    });

    it('should handle null config', () => {
      const result = getSeriesFieldFromConfig(null);
      expect(result).toBeUndefined();
    });

    it('should handle undefined config', () => {
      const result = getSeriesFieldFromConfig(undefined);
      expect(result).toBeUndefined();
    });

    it('should handle empty seriesConfigs array', () => {
      const result = getSeriesFieldFromConfig({
        seriesConfigs: [],
      });
      expect(result).toBeUndefined();
    });
  });

  describe('extractDatasetField', () => {
    it('should return field/value when series.groupBy is set', () => {
      const result = extractDatasetField('Dr. Smith', {
        series: { groupBy: 'provider_name' },
      });
      expect(result).toEqual({
        field: 'provider_name',
        value: 'Dr. Smith',
      });
    });

    it('should return field/value when seriesConfigs has groupBy', () => {
      const result = extractDatasetField('Dr. Jones', {
        seriesConfigs: [{ groupBy: 'provider_name' }],
      });
      expect(result).toEqual({
        field: 'provider_name',
        value: 'Dr. Jones',
      });
    });

    it('should return null when datasetLabel is undefined', () => {
      const result = extractDatasetField(undefined, {
        series: { groupBy: 'provider_name' },
      });
      expect(result).toBeNull();
    });

    it('should return null when series.groupBy is not set', () => {
      const result = extractDatasetField('Dr. Smith', {});
      expect(result).toBeNull();
    });

    it('should return null when series.groupBy is "none"', () => {
      const result = extractDatasetField('Dr. Smith', {
        series: { groupBy: 'none' },
      });
      expect(result).toBeNull();
    });

    it('should handle null config', () => {
      const result = extractDatasetField('Dr. Smith', null);
      expect(result).toBeNull();
    });

    it('should handle undefined config', () => {
      const result = extractDatasetField('Dr. Smith', undefined);
      expect(result).toBeNull();
    });
  });
});

