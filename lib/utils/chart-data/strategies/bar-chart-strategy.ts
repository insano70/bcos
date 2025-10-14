/**
 * Bar Chart Strategy
 * 
 * Handles transformation for vertical bar charts.
 */

import type { AggAppMeasure, ChartData } from '@/lib/types/analytics';
import { BaseChartTransformStrategy, type TransformConfig } from './base-strategy';
import { getCssVariable } from '@/components/utils/utils';
import { toMMDDYYYY, createCategoryLabel } from '../formatters/date-formatter';
import { getColorPalette, adjustColorOpacity } from '../services/chart-color-service';

/**
 * Bar Chart Transformation Strategy
 */
export class BarChartStrategy extends BaseChartTransformStrategy {
  readonly type = 'bar';

  canHandle(chartType: string): boolean {
    return chartType === 'bar' || chartType === 'stacked-bar';
  }

  transform(measures: AggAppMeasure[], config: TransformConfig): ChartData {
    if (measures.length === 0) {
      return { labels: [], datasets: [] };
    }

    const groupBy = this.getGroupBy(config);
    const paletteId = this.getPaletteId(config);

    if (groupBy === 'none') {
      return this.createSingleSeries(measures);
    } else {
      return this.createMultiSeries(measures, groupBy, paletteId, config);
    }
  }

  /**
   * Create single series bar chart
   */
  private createSingleSeries(measures: AggAppMeasure[]): ChartData {
    const sortedMeasures = this.sortMeasuresByDate(measures);

    const chartData: ChartData = {
      labels: sortedMeasures.map((m) => toMMDDYYYY(m.date_index)),
      datasets: [
        {
          label: sortedMeasures[0]?.measure || 'Value',
          data: sortedMeasures.map((m) => this.parseValue(m.measure_value)),
          backgroundColor: getCssVariable('--color-violet-500'),
          hoverBackgroundColor: getCssVariable('--color-violet-600'),
          borderRadius: 4,
          barPercentage: 0.7,
          categoryPercentage: 0.7,
        },
      ],
    };

    return this.attachMeasureType(chartData, this.extractMeasureType(measures));
  }

  /**
   * Create multi-series bar chart
   */
  private createMultiSeries(
    measures: AggAppMeasure[],
    groupBy: string,
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
        backgroundColor: color,
        hoverBackgroundColor: adjustColorOpacity(color, 0.8),
        borderRadius: 4,
        barPercentage: 0.7,
        categoryPercentage: 0.7,
      };
    });

    // Create category labels based on frequency
    const categoryLabels = datesWithData.map((dateStr) => {
      return createCategoryLabel(dateStr, measures[0]?.frequency || 'Monthly');
    });

    const chartData: ChartData = {
      labels: categoryLabels,
      datasets,
    };

    return this.attachMeasureType(chartData, this.extractMeasureType(measures));
  }

  // getGroupKey now provided by base class
}

