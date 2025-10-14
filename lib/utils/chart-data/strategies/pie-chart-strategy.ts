/**
 * Pie Chart Strategy
 * 
 * Handles transformation for pie and doughnut charts.
 */

import type { AggAppMeasure, ChartData } from '@/lib/types/analytics';
import { BaseChartTransformStrategy, type TransformConfig } from './base-strategy';
import { getColorPalette, adjustColorOpacity } from '../services/chart-color-service';

/**
 * Pie Chart Transformation Strategy
 * Handles both pie and doughnut charts
 */
export class PieChartStrategy extends BaseChartTransformStrategy {
  readonly type = 'pie';

  canHandle(chartType: string): boolean {
    return chartType === 'pie' || chartType === 'doughnut';
  }

  transform(measures: AggAppMeasure[], config: TransformConfig): ChartData {
    if (measures.length === 0) {
      return { labels: [], datasets: [] };
    }

    const groupBy = this.getGroupBy(config);
    const paletteId = this.getPaletteId(config);
    const groupField = groupBy === 'none' ? 'measure' : groupBy;

    // Aggregate data by group field
    const groupedData = new Map<string, number>();

    measures.forEach((measure) => {
      const groupKey = this.getGroupKey(measure, groupField, config);
      const currentValue = groupedData.get(groupKey) || 0;
      const measureValue = this.parseValue(measure.measure_value);
      groupedData.set(groupKey, currentValue + measureValue);
    });

    const labels = Array.from(groupedData.keys());
    const data = labels.map((label) => groupedData.get(label) || 0);
    const colors = getColorPalette(paletteId);

    const chartData: ChartData = {
      labels,
      datasets: [
        {
          label: measures[0]?.measure || 'Value',
          data,
          backgroundColor: colors.slice(0, labels.length),
          hoverBackgroundColor: colors
            .slice(0, labels.length)
            .map((color) => adjustColorOpacity(color, 0.8)),
          borderWidth: 0,
        },
      ],
    };

    return this.attachMeasureType(chartData, this.extractMeasureType(measures));
  }

  // getGroupKey now provided by base class
}

