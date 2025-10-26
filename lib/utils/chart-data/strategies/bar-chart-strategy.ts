/**
 * Bar Chart Strategy
 *
 * Handles transformation for vertical bar charts.
 */

import { getCssVariable } from '@/components/utils/utils';
import type { AggAppMeasure, ChartData } from '@/lib/types/analytics';
import { createCategoryLabel, toMMDDYYYY } from '../formatters/date-formatter';
import { adjustColorOpacity, getColorPalette } from '../services/chart-color-service';
import { BaseChartTransformStrategy, type TransformConfig } from './base-strategy';

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
   * Aggregates (sums) all rows by date
   */
  private createSingleSeries(measures: AggAppMeasure[]): ChartData {
    // Aggregate data by date - sum all values for each date
    const aggregatedByDate = new Map<string, number>();

    measures.forEach((measure) => {
      const dateKey = (measure.date_index ?? measure.date_value ?? '') as string;
      const value = measure.measure_value ?? measure.numeric_value ?? 0;
      const measureValue = this.parseValue(
        typeof value === 'string' || typeof value === 'number' ? value : 0
      );

      // Sum values for the same date
      const currentValue = aggregatedByDate.get(dateKey) || 0;
      aggregatedByDate.set(dateKey, currentValue + measureValue);
    });

    // Sort dates chronologically
    const sortedDates = Array.from(aggregatedByDate.keys()).sort(
      (a, b) => new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()
    );

    const chartData: ChartData = {
      labels: sortedDates.map((date) => toMMDDYYYY(date)),
      datasets: [
        {
          label: (measures[0]?.measure ?? 'Value') as string,
          data: sortedDates.map((date) => aggregatedByDate.get(date) || 0),
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
   * Aggregates (sums) all rows by groupBy field and date
   */
  private createMultiSeries(
    measures: AggAppMeasure[],
    groupBy: string,
    paletteId: string,
    config: TransformConfig
  ): ChartData {
    // Group data by the groupBy field and date, summing values
    const groupedData = new Map<string, Map<string, number>>();
    const allDates = new Set<string>();

    measures.forEach((measure) => {
      const groupKey = this.getGroupKey(measure, groupBy, config);
      const dateKey = (measure.date_index ?? measure.date_value ?? '') as string;

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
        backgroundColor: color,
        hoverBackgroundColor: adjustColorOpacity(color, 0.8),
        borderRadius: 4,
        barPercentage: 0.7,
        categoryPercentage: 0.7,
      };
    });

    // Sort datasets by total value (descending) for stacked bar charts
    // This ensures largest segments appear at the bottom of the stack
    const sortedDatasets = datasets
      .map((dataset) => {
        // Calculate total value for this dataset across all dates
        const total = dataset.data.reduce((sum, val) => {
          const numericValue = typeof val === 'number' ? val : 0;
          return sum + numericValue;
        }, 0);

        return { dataset, total };
      })
      // Sort by total descending (largest first = bottom of stack)
      .sort((a, b) => b.total - a.total)
      // Extract dataset objects
      .map((item) => item.dataset);

    // Create category labels based on frequency
    // Extract frequency dynamically from data (no hardcoded field names)
    const frequency = this.extractTimePeriod(measures);
    const categoryLabels = datesWithData.map((dateStr) => {
      return createCategoryLabel(dateStr, frequency);
    });

    const chartData: ChartData = {
      labels: categoryLabels,
      datasets: sortedDatasets,
    };

    return this.attachMeasureType(chartData, this.extractMeasureType(measures));
  }

  // getGroupKey now provided by base class
}
