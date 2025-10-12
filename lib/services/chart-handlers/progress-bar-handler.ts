import type { AggAppMeasure, ChartData } from '@/lib/types/analytics';
import { log } from '@/lib/logger';
import { BaseChartHandler } from './base-handler';
import { getPaletteColors } from '@/lib/services/color-palettes';

type AggregationType = 'sum' | 'avg' | 'count' | 'min' | 'max';

/**
 * Progress Bar Chart Handler
 *
 * Handles progress bar charts that display multiple grouped bars,
 * each showing progress toward a target value.
 *
 * Features:
 * - Grouped data aggregation
 * - Percentage calculation against target
 * - Supports multiple aggregation types (sum, avg, count, min, max)
 * - Falls back to single value if no groupBy specified
 */
export class ProgressBarChartHandler extends BaseChartHandler {
  type = 'progress-bar';

  /**
   * Check if this handler can handle the configuration
   */
  canHandle(config: Record<string, unknown>): boolean {
    return config.chartType === 'progress-bar';
  }

  /**
   * Aggregate data values based on aggregation type
   */
  private aggregateData(
    values: number[],
    aggregationType: AggregationType = 'sum'
  ): number {
    if (values.length === 0) return 0;

    let result = 0;

    switch (aggregationType) {
      case 'sum':
        result = values.reduce((sum, val) => sum + val, 0);
        break;
      case 'avg':
        result = values.reduce((sum, val) => sum + val, 0) / values.length;
        break;
      case 'count':
        result = values.length;
        break;
      case 'min':
        result = Math.min(...values);
        break;
      case 'max':
        result = Math.max(...values);
        break;
      default:
        log.warn('Unknown aggregation type, defaulting to sum', {
          aggregationType,
        });
        result = values.reduce((sum, val) => sum + val, 0);
    }

    log.debug('Data aggregated', {
      aggregationType,
      valueCount: values.length,
      sampleValues: values.slice(0, 3),
      result,
    });

    return result;
  }

  /**
   * Transform raw data into format for progress bar chart
   */
  transform(data: Record<string, unknown>[], config: Record<string, unknown>): ChartData {
    const startTime = Date.now();

    try {
      const aggregationType = (config.aggregation as AggregationType) || 'sum';
      const groupBy = this.getGroupBy(config);
      const target = config.target as number | undefined;
      const colorPalette = this.getColorPalette(config);
      const valueColumn = (config.valueColumn as string) || 'measure_value';

      log.info('Transforming progress bar chart data', {
        recordCount: data.length,
        aggregationType,
        groupBy,
        hasTarget: Boolean(target),
        valueColumn,
      });

      // Defensive check: handle empty data array
      if (data.length === 0) {
        log.warn('Progress bar chart received empty data array');

        return {
          labels: [],
          datasets: [{
            label: config.title as string || 'Progress',
            data: [],
            measureType: 'percentage',
          }],
          measureType: 'percentage',
        };
      }

      // Group data by the specified field (target is calculated dynamically later)
      const grouped = new Map<string, number[]>();

      // Log first few records for debugging
      if (data.length > 0) {
        log.debug('Sample raw data records', {
          sampleCount: Math.min(3, data.length),
          samples: data.slice(0, 3).map(r => ({
            groupBy: r[groupBy || 'none'],
            valueColumn: r[valueColumn],
            valueType: typeof r[valueColumn],
          })),
        });
      }

      for (const record of data) {
        const groupKey = groupBy && groupBy !== 'none'
          ? String(record[groupBy] || 'Unknown')
          : 'Total';

        const value = typeof record[valueColumn] === 'string'
          ? parseFloat(record[valueColumn] as string)
          : (record[valueColumn] as number || 0);

        const numValue = Number.isNaN(value) ? 0 : value;

        if (!grouped.has(groupKey)) {
          grouped.set(groupKey, []);
        }
        grouped.get(groupKey)!.push(numValue);
      }

      log.info('Data grouped for progress bars', {
        groupCount: grouped.size,
        groups: Array.from(grouped.keys()),
      });

      // Aggregate each group first
      const groupedData: Array<{
        label: string;
        value: number;
      }> = [];

      // Convert grouped entries to array to avoid iterator issues
      const groupedArray = Array.from(grouped.entries());
      for (const [groupLabel, values] of groupedArray) {
        const aggregatedValue = this.aggregateData(values, aggregationType);

        groupedData.push({
          label: groupLabel,
          value: aggregatedValue,
        });
      }

      // Calculate dynamic target = sum of all group values
      const dynamicTarget = groupedData.reduce((sum, group) => sum + group.value, 0);

      log.info('Dynamic target calculated for progress bars', {
        groupCount: groupedData.length,
        dynamicTarget,
        configuredTarget: target,
        usingDynamicTarget: true,
      });

      // Calculate percentages based on dynamic target
      const groupedDataWithPercentages = groupedData.map(group => ({
        ...group,
        percentage: dynamicTarget > 0 ? (group.value / dynamicTarget) * 100 : 0,
      }));

      // Sort by value descending (largest to smallest)
      groupedDataWithPercentages.sort((a, b) => b.value - a.value);

      // Extract sorted arrays
      const labels = groupedDataWithPercentages.map(d => d.label);
      const rawValues = groupedDataWithPercentages.map(d => d.value);
      const percentages = groupedDataWithPercentages.map(d => d.percentage);

      log.debug('Progress bar groups calculated', {
        sampleGroups: groupedDataWithPercentages.slice(0, 3).map(g => ({
          label: g.label,
          value: g.value,
          percentage: g.percentage.toFixed(2) + '%',
        })),
      });

      // Determine measure type from data
      const measureType = (config.measureType as string) ||
                         (data[0]?.measure_type as string) ||
                         'number';

      const chartData: ChartData = {
        labels,
        datasets: [{
          label: config.title as string || 'Progress',
          data: percentages,
          measureType: 'percentage',
          // Store raw values for display alongside percentages
          rawValues,
          // Store dynamic target (sum of all values)
          target: dynamicTarget,
          aggregationType,
          // Store original measure type for formatting raw values
          originalMeasureType: measureType,
        }],
        measureType: 'percentage',
        // Store colors for frontend reference
        colors: getPaletteColors(colorPalette),
      };

      const duration = Date.now() - startTime;

      log.info('Progress bar chart data transformed', {
        duration,
        aggregationType,
        groupCount: labels.length,
        target,
        datasetCount: chartData.datasets?.length ?? 0,
        sampleLabels: labels.slice(0, 3),
        sampleRawValues: rawValues.slice(0, 3),
        samplePercentages: percentages.slice(0, 3),
      });

      return chartData;
    } catch (error) {
      log.error('Failed to transform progress bar chart data', error, {
        recordCount: data.length,
      });

      throw error;
    }
  }

  /**
   * Custom validation for progress bar charts
   */
  protected validateCustom(config: Record<string, unknown>): string[] {
    const errors: string[] = [];

    // Validate aggregation type if specified
    if (config.aggregation) {
      const validAggregations: AggregationType[] = ['sum', 'avg', 'count', 'min', 'max'];
      const aggregation = config.aggregation as string;

      if (!validAggregations.includes(aggregation as AggregationType)) {
        errors.push(
          `Invalid aggregation type: ${aggregation}. Must be one of: ${validAggregations.join(', ')}`
        );
      }
    }

    // Progress bar target is now optional - we calculate it dynamically from data
    // If a target is provided, validate it's a positive number
    if (config.target) {
      const target = config.target as number;
      if (typeof target !== 'number' || target <= 0) {
        errors.push('Progress bar target must be a positive number if provided');
      }
    }

    return errors;
  }
}
