/**
 * Progress Bar Chart Strategy
 * 
 * Handles transformation for progress bar charts.
 * Similar to horizontal bar but with percentage calculations.
 */

import type { AggAppMeasure, ChartData } from '@/lib/types/analytics';
import { BaseChartTransformStrategy, type TransformConfig } from './base-strategy';
import { getColorPalette } from '../services/chart-color-service';
import { aggregateAcrossDates } from '../services/data-aggregator';

/**
 * Progress Bar Chart Transformation Strategy
 */
export class ProgressBarStrategy extends BaseChartTransformStrategy {
  readonly type = 'progress-bar';

  canHandle(chartType: string): boolean {
    return chartType === 'progress-bar';
  }

  validate(config: TransformConfig): { isValid: boolean; errors: string[] } {
    const baseValidation = super.validate(config);
    const errors = [...baseValidation.errors];

    const groupBy = this.getGroupBy(config);
    if (groupBy === 'none') {
      errors.push('Progress bar charts require a groupBy field');
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
      throw new Error('Progress bar charts require a groupBy field');
    }

    // Aggregate data by groupBy field, summing across all dates
    const aggregatedData = aggregateAcrossDates(measures, groupBy, 'sum');

    // Sort by value (descending) - highest to lowest
    const sortedEntries = Array.from(aggregatedData.entries()).sort((a, b) => b[1] - a[1]);

    // Calculate total for percentages
    const total = sortedEntries.reduce((sum, [, value]) => sum + value, 0);

    // Create data with percentages for progress bars
    const progressData = sortedEntries.map(([label, value]) => ({
      label,
      value,
      percentage: total > 0 ? (value / total) * 100 : 0,
    }));

    const colors = getColorPalette(paletteId);

    // Store in Chart.js compatible format (will be handled differently in rendering)
    const chartData: ChartData = {
      labels: progressData.map((d) => d.label),
      datasets: [
        {
          label: (measures[0]?.measure ?? 'Value') as string,
          data: progressData.map((d) => d.value),
          backgroundColor: colors[0] || '#8B5CF6',
          // Note: Progress bar metadata stored in data array, not as extension
        },
      ],
    };

    return this.attachMeasureType(chartData, this.extractMeasureType(measures));
  }
}

