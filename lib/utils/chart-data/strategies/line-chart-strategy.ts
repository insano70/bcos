/**
 * Line Chart Strategy
 *
 * Handles transformation for line and area charts.
 */

import { getCssVariable } from '@/components/utils/utils';
import type { AggAppMeasure, ChartData } from '@/lib/types/analytics';
import { toChartJsDate } from '../formatters/date-formatter';
import { adjustColorOpacity, getColorPalette } from '../services/chart-color-service';
import { BaseChartTransformStrategy, type TransformConfig } from './base-strategy';

/**
 * Line Chart Transformation Strategy
 * Handles both line and area charts
 */
export class LineChartStrategy extends BaseChartTransformStrategy {
  readonly type = 'line';

  canHandle(chartType: string): boolean {
    return chartType === 'line' || chartType === 'area';
  }

  validate(config: TransformConfig): { isValid: boolean; errors: string[] } {
    const baseValidation = super.validate(config);
    const errors = [...baseValidation.errors];

    // Line charts don't have specific validation requirements beyond base

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
    const filled = config.filled || false;
    const paletteId = this.getPaletteId(config);

    if (groupBy === 'none') {
      return this.createSingleSeries(measures, filled);
    } else {
      return this.createMultiSeries(measures, groupBy, filled, paletteId, config);
    }
  }

  /**
   * Create single series line/area chart
   * Aggregates (sums) all rows by date
   */
  private createSingleSeries(measures: AggAppMeasure[], filled: boolean): ChartData {
    // Aggregate data by date - sum all values for each date
    const aggregatedByDate = new Map<string, number>();
    const frequency = (measures[0]?.frequency ?? 'Monthly') as string;

    measures.forEach((measure) => {
      const dateKey = this.normalizeDate(measure.date_index ?? measure.date_value);
      const value = measure.measure_value ?? measure.numeric_value ?? 0;
      const measureValue = this.parseValue(
        typeof value === 'string' || typeof value === 'number' ? value : 0
      );

      // Sum values for the same date
      if (dateKey) {
        const currentValue = aggregatedByDate.get(dateKey) || 0;
        aggregatedByDate.set(dateKey, currentValue + measureValue);
      }
    });

    // Sort dates chronologically
    const sortedDates = Array.from(aggregatedByDate.keys()).sort(
      (a, b) => new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()
    );

    // Convert dates to Chart.js format
    const dateObjects = sortedDates.map((dateStr) => toChartJsDate(dateStr, frequency));

    const chartData: ChartData = {
      labels: dateObjects,
      datasets: [
        {
          label: (measures[0]?.measure ?? 'Value') as string,
          data: sortedDates.map((date) => aggregatedByDate.get(date) || 0),
          borderColor: getCssVariable('--color-violet-500'),
          backgroundColor: filled
            ? adjustColorOpacity(getCssVariable('--color-violet-500'), 0.1)
            : getCssVariable('--color-violet-500'),
          fill: filled,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    };

    return this.attachMeasureType(chartData, this.extractMeasureType(measures));
  }

  /**
   * Create multi-series line/area chart
   * Aggregates (sums) all rows by groupBy field and date
   */
  private createMultiSeries(
    measures: AggAppMeasure[],
    groupBy: string,
    filled: boolean,
    paletteId: string,
    config: TransformConfig
  ): ChartData {
    // Group data by the groupBy field and date, summing values
    const groupedData = new Map<string, Map<string, number>>();
    const allDates = new Set<string>();

    measures.forEach((measure) => {
      const groupKey = this.getGroupKey(measure, groupBy, config);
      const dateKey = this.normalizeDate(measure.date_index ?? measure.date_value);

      if (!dateKey) return; // Skip measures with invalid dates

      allDates.add(dateKey);

      let dateMap = groupedData.get(groupKey);
      if (!dateMap) {
        dateMap = new Map();
        groupedData.set(groupKey, dateMap);
      }

      const value = measure.measure_value ?? measure.numeric_value ?? 0;
      const measureValue = this.parseValue(
        typeof value === 'string' || typeof value === 'number' ? value : 0
      );

      // Sum values for the same groupKey + date combination
      const currentValue = dateMap.get(dateKey) || 0;
      dateMap.set(dateKey, currentValue + measureValue);
    });

    // Sort dates chronologically
    const sortedDates = Array.from(allDates).sort(
      (a, b) => new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()
    );

    // Filter out dates where no groups have data
    const datesWithData = sortedDates.filter((dateIndex) => {
      return Array.from(groupedData.values()).some((dateMap) => {
        const value = dateMap.get(dateIndex) || 0;
        return value > 0;
      });
    });

    // Create datasets for each group
    const colors = getColorPalette(paletteId);
    let colorIndex = 0;
    const datasets = Array.from(groupedData.entries()).map(([groupKey, dateMap]) => {
      const data = datesWithData.map((dateIndex) => dateMap.get(dateIndex) || 0);
      const color = colors[colorIndex % colors.length] || '#00AEEF';

      colorIndex++;

      return {
        label: groupKey,
        data,
        borderColor: color,
        backgroundColor: filled ? adjustColorOpacity(color, 0.1) : color,
        fill: filled,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 5,
      };
    });

    // Convert dates to Chart.js format
    const finalLabels = datesWithData.map((dateStr) => {
      return toChartJsDate(dateStr, (measures[0]?.frequency ?? 'Monthly') as string);
    });

    const chartData: ChartData = {
      labels: finalLabels,
      datasets,
    };

    return this.attachMeasureType(chartData, this.extractMeasureType(measures));
  }

  // getGroupKey now provided by base class
}
