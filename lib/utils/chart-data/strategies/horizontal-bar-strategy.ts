/**
 * Horizontal Bar Chart Strategy
 *
 * Handles transformation for horizontal bar charts.
 * Aggregates across dates by groupBy field.
 */

import type { AggAppMeasure, ChartData } from '@/lib/types/analytics';
import { adjustColorOpacity, getColorPalette } from '../services/chart-color-service';
import { aggregateAcrossDates } from '../services/data-aggregator';
import { BaseChartTransformStrategy, type TransformConfig } from './base-strategy';

/**
 * Horizontal Bar Chart Transformation Strategy
 */
export class HorizontalBarStrategy extends BaseChartTransformStrategy {
  readonly type = 'horizontal-bar';

  canHandle(chartType: string): boolean {
    return chartType === 'horizontal-bar';
  }

  validate(config: TransformConfig): { isValid: boolean; errors: string[] } {
    const baseValidation = super.validate(config);
    const errors = [...baseValidation.errors];

    const groupBy = this.getGroupBy(config);
    if (groupBy === 'none') {
      errors.push('Horizontal bar charts require a groupBy field');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  transform(measures: AggAppMeasure[], config: TransformConfig): ChartData {
    if (measures.length === 0) {
      return { labels: [], datasets: [] };
    }

    const groupBy = this.getGroupBy(config);
    const paletteId = this.getPaletteId(config);

    if (groupBy === 'none') {
      throw new Error('Horizontal bar charts require a groupBy field');
    }

    // Aggregate data by groupBy field, summing across all dates
    const aggregatedData = aggregateAcrossDates(measures, groupBy, 'sum');

    // Sort by value (descending) - highest to lowest
    const sortedEntries = Array.from(aggregatedData.entries()).sort((a, b) => b[1] - a[1]);

    const colors = getColorPalette(paletteId);

    // NEW: Build color array that respects series_color
    const backgroundColors = sortedEntries.map(([label], index) => {
      // Find a measure with this groupBy value
      const measureWithLabel = measures.find(
        (m) => this.getGroupKey(m, groupBy, config) === label
      );
      const customColor = measureWithLabel?.series_color as string | undefined;

      // Use custom color if available, otherwise palette color
      return customColor || colors[index % colors.length] || '#00AEEF';
    });

    const chartData: ChartData = {
      labels: sortedEntries.map(([label]) => label),
      datasets: [
        {
          label: (measures[0]?.measure ?? 'Value') as string,
          data: sortedEntries.map(([, value]) => value),
          backgroundColor: backgroundColors,
          hoverBackgroundColor: backgroundColors.map((color) => adjustColorOpacity(color, 0.8)),
          borderRadius: 4,
          barPercentage: 0.7,
          categoryPercentage: 0.9,
        },
      ],
    };

    return this.attachMeasureType(chartData, this.extractMeasureType(measures));
  }
}
