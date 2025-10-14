/**
 * Line Chart Strategy
 * 
 * Handles transformation for line and area charts.
 */

import type { AggAppMeasure, ChartData } from '@/lib/types/analytics';
import { BaseChartTransformStrategy, type TransformConfig } from './base-strategy';
import { getCssVariable } from '@/components/utils/utils';
import { toChartJsDate } from '../formatters/date-formatter';
import { getColorPalette, adjustColorOpacity } from '../services/chart-color-service';

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
   */
  private createSingleSeries(measures: AggAppMeasure[], filled: boolean): ChartData {
    const sortedMeasures = this.sortMeasuresByDate(measures);

    // Handle dates based on frequency
    const dateObjects = sortedMeasures.map((m) => {
      return toChartJsDate(m.date_index, m.frequency || 'Monthly');
    });

    const chartData: ChartData = {
      labels: dateObjects,
      datasets: [
        {
          label: sortedMeasures[0]?.measure || 'Value',
          data: sortedMeasures.map((m) => this.parseValue(m.measure_value)),
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
   */
  private createMultiSeries(
    measures: AggAppMeasure[],
    groupBy: string,
    filled: boolean,
    paletteId: string,
    config: TransformConfig
  ): ChartData {
    // Group data by the groupBy field and date
    const groupedData = new Map<string, Map<string, number>>();
    const allDates = new Set<string>();

    measures.forEach((measure) => {
      const groupKey = this.getGroupKey(measure, groupBy, config);
      const dateKey = measure.date_index;

      allDates.add(dateKey);

      let dateMap = groupedData.get(groupKey);
      if (!dateMap) {
        dateMap = new Map();
        groupedData.set(groupKey, dateMap);
      }

      const measureValue = this.parseValue(measure.measure_value);
      dateMap.set(dateKey, measureValue);
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
      return toChartJsDate(dateStr, measures[0]?.frequency || 'Monthly');
    });

    const chartData: ChartData = {
      labels: finalLabels,
      datasets,
    };

    return this.attachMeasureType(chartData, this.extractMeasureType(measures));
  }

  // getGroupKey now provided by base class
}

