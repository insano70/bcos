/**
 * Multi-Series Strategy
 *
 * Handles transformation for charts with multiple series/measures.
 * Supports series-tagged data with custom aggregations.
 */

import type { AggAppMeasure, ChartData, ChartDataset } from '@/lib/types/analytics';
import { formatDateLabel } from '../formatters/date-formatter';
import { getColorPalette } from '../services/chart-color-service';
import {
  applyAggregation,
  groupByFieldAndDate,
  groupBySeriesAndDate,
} from '../services/data-aggregator';
import { BaseChartTransformStrategy, type TransformConfig } from './base-strategy';

/**
 * Configuration for multi-series charts
 */
interface MultiSeriesConfig extends TransformConfig {
  aggregations?: Record<string, 'sum' | 'avg' | 'count' | 'min' | 'max'>;
}

/**
 * Multi-Series Chart Transformation Strategy
 * Handles charts with multiple measures or series-tagged data
 */
export class MultiSeriesStrategy extends BaseChartTransformStrategy {
  readonly type = 'multi-series';

  canHandle(chartType: string): boolean {
    return chartType === 'multi-series';
  }

  validate(config: MultiSeriesConfig): { isValid: boolean; errors: string[] } {
    const baseValidation = super.validate(config);
    const errors = [...baseValidation.errors];

    // Validate aggregations if provided
    if (config.aggregations) {
      const validAggregations = ['sum', 'avg', 'count', 'min', 'max'];
      for (const [key, aggregation] of Object.entries(config.aggregations)) {
        if (!validAggregations.includes(aggregation)) {
          errors.push(`Invalid aggregation type '${aggregation}' for series '${key}'`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  transform(measures: AggAppMeasure[], config: MultiSeriesConfig): ChartData {
    if (measures.length === 0) {
      return { labels: [], datasets: [] };
    }

    const paletteId = this.getPaletteId(config);
    const groupBy = this.getGroupBy(config);
    const aggregations = config.aggregations || {};

    // Check if we have series-tagged data
    const hasSeriesLabels = measures.some((m) => m.series_label);

    if (hasSeriesLabels) {
      return this.createFromTaggedData(measures, aggregations, paletteId);
    } else {
      return this.createFromGroupedData(measures, groupBy, aggregations, paletteId);
    }
  }

  /**
   * Create multi-series chart from series-tagged data
   */
  private createFromTaggedData(
    measures: AggAppMeasure[],
    aggregations: Record<string, 'sum' | 'avg' | 'count' | 'min' | 'max'>,
    paletteId: string
  ): ChartData {
    // Group by series label and date
    const groupedBySeries = groupBySeriesAndDate(measures);

    // Sort dates chronologically using base class helper
    const sortedDates = this.extractAndSortDates(measures);

    // Create datasets
    const colors = getColorPalette(paletteId);
    let colorIndex = 0;
    const datasets: ChartDataset[] = [];

    groupedBySeries.forEach((dateMap, seriesLabel) => {
      const aggregationType = aggregations[seriesLabel] || 'sum';

      const data = sortedDates.map((dateIndex) => {
        const values = dateMap.get(dateIndex) || [0];
        return applyAggregation(values, aggregationType);
      });

      // Find custom color from series config
      const sampleMeasure = measures.find((m) => m.series_label === seriesLabel);
      const customColor = sampleMeasure?.series_color;
      const color = customColor || colors[colorIndex % colors.length] || '#00AEEF';

      datasets.push({
        label: seriesLabel,
        data,
        borderColor: color,
        backgroundColor: color,
        fill: false,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderRadius: 4,
        barPercentage: 0.7,
        categoryPercentage: 0.7,
      });

      colorIndex++;
    });

    // Format labels
    const labels = sortedDates.map((dateStr) => {
      return formatDateLabel(dateStr, (measures[0]?.frequency ?? 'Monthly') as string);
    });

    const chartData: ChartData = {
      labels,
      datasets,
    };

    return this.attachMeasureType(chartData, this.extractMeasureType(measures));
  }

  /**
   * Create multi-series chart from grouped data
   */
  private createFromGroupedData(
    measures: AggAppMeasure[],
    groupBy: string,
    aggregations: Record<string, 'sum' | 'avg' | 'count' | 'min' | 'max'>,
    paletteId: string
  ): ChartData {
    // Group data by field and date
    const groupedData = groupByFieldAndDate(measures, groupBy);

    // Sort dates chronologically using base class helper
    const sortedDates = this.extractAndSortDates(measures);

    // Create datasets
    const colors = getColorPalette(paletteId);
    let colorIndex = 0;
    const datasets: ChartDataset[] = [];

    groupedData.forEach((dateMap, groupKey) => {
      const aggregationType = aggregations[groupKey] || 'sum';

      const data = sortedDates.map((dateIndex) => {
        const values = dateMap.get(dateIndex) || [0];
        return applyAggregation(values, aggregationType);
      });

      const color = colors[colorIndex % colors.length] || '#00AEEF';

      datasets.push({
        label: `${groupKey} (${aggregationType})`,
        data,
        borderColor: color,
        backgroundColor: color,
        fill: false,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderRadius: 4,
        barPercentage: 0.7,
        categoryPercentage: 0.7,
      });

      colorIndex++;
    });

    // Format labels
    const labels = sortedDates.map((dateStr) => {
      return formatDateLabel(dateStr, (measures[0]?.frequency ?? 'Monthly') as string);
    });

    const chartData: ChartData = {
      labels,
      datasets,
    };

    return this.attachMeasureType(chartData, this.extractMeasureType(measures));
  }
}
