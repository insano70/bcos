import type { ChartData } from '@/lib/types/analytics';
import { log } from '@/lib/logger';
import { BaseChartHandler } from './base-handler';
import { getColumnName } from './column-resolver';

/**
 * Aggregation type for metric charts
 */
export type AggregationType = 'sum' | 'avg' | 'count' | 'min' | 'max';

/**
 * Metric Chart Handler
 *
 * Handles single-value metric displays (number, progress-bar charts).
 *
 * **Phase 3 Enhancement**: Server-side aggregation
 * - Supports multiple aggregation types: sum, avg, count, min, max
 * - Eliminates client-side calculation for number charts
 * - Provides display-ready values for all metric visualizations
 *
 * **Aggregation Types**:
 * - `sum`: Total of all values (default)
 * - `avg`: Average (mean) of all values
 * - `count`: Count of records
 * - `min`: Minimum value
 * - `max`: Maximum value
 */
export class MetricChartHandler extends BaseChartHandler {
  type = 'number';

  canHandle(config: Record<string, unknown>): boolean {
    const chartType = config.chartType as string;
    return chartType === 'number';
  }

  /**
   * Perform aggregation on metric data
   *
   * @param data - Raw measure data
   * @param aggregationType - Type of aggregation to perform
   * @param valueColumn - Column name containing the numeric value (defaults to 'measure_value')
   * @returns Aggregated single value
   */
  private aggregateData(data: Record<string, unknown>[], aggregationType: AggregationType = 'sum', valueColumn: string = 'measure_value'): number {
    const startTime = Date.now();

    // Extract and parse all values
    const values = data.map(record => {
      const value = typeof record[valueColumn] === 'string'
        ? parseFloat(record[valueColumn] as string)
        : (record[valueColumn] as number || 0);
      return Number.isNaN(value) ? 0 : value;
    });

    let result: number;

    switch (aggregationType) {
      case 'sum':
        result = values.reduce((sum, val) => sum + val, 0);
        break;

      case 'avg':
        result = values.length > 0
          ? values.reduce((sum, val) => sum + val, 0) / values.length
          : 0;
        break;

      case 'count':
        result = values.length;
        break;

      case 'min':
        result = values.length > 0 ? Math.min(...values) : 0;
        break;

      case 'max':
        result = values.length > 0 ? Math.max(...values) : 0;
        break;

      default:
        log.warn('Unknown aggregation type, defaulting to sum', {
          aggregationType,
        });
        result = values.reduce((sum, val) => sum + val, 0);
    }

    const duration = Date.now() - startTime;

    log.info('Data aggregated', {
      aggregationType,
      valueColumn,
      valueCount: values.length,
      result,
      duration,
    });

    return result;
  }

  async transform(data: Record<string, unknown>[], config: Record<string, unknown>): Promise<ChartData> {
    const startTime = Date.now();

    try {
      const chartType = config.chartType as 'number';
      const aggregationType = (config.aggregation as AggregationType) || 'sum';
      
      // Use data source configuration to determine the value column (not auto-detection!)
      const valueColumn = config.valueColumn as string | undefined
        || await getColumnName(config.dataSourceId as number | undefined, 'measure');

      log.info('Transforming metric chart data', {
        chartType,
        recordCount: data.length,
        aggregationType,
        valueColumn,
        dataSourceId: config.dataSourceId,
      });

      // Defensive check: handle empty data array
      if (data.length === 0) {
        log.warn('Metric chart received empty data array', {
          chartType,
          config,
        });

        // Return zero value for empty data
        return {
          labels: [],
          datasets: [{
            label: config.title as string || 'Total',
            data: [0],
            measureType: 'number',
          }],
          measureType: 'number',
        };
      }

      // Perform server-side aggregation based on type
      const aggregatedValue = this.aggregateData(data, aggregationType, valueColumn);

      // Determine the measure type for formatting (currency, percentage, number)
      // Use config override, or fall back to data column, or default to 'number'
      const measureType = (config.measureType as string) ||
                         (data[0]?.measure_type as string) ||
                         'number';

      // Number chart: return single aggregated value in a dataset
      // Phase 3: Server-side aggregation complete
      const chartData: ChartData = {
        labels: [],
        datasets: [{
          label: config.title as string || 'Total',
          data: [aggregatedValue],
          measureType,
          aggregationType, // Include aggregation type for frontend reference
        }],
        measureType,
      };

      const duration = Date.now() - startTime;

      log.info('Metric chart data transformed', {
        chartType,
        duration,
        aggregationType,
        aggregatedValue,
        measureType,
        datasetCount: chartData.datasets?.length ?? 0,
      });

      return chartData;
    } catch (error) {
      log.error('Failed to transform metric chart data', error, {
        chartType: config.chartType,
        recordCount: data.length,
      });

      throw error;
    }
  }

  protected validateCustom(config: Record<string, unknown>): string[] {
    const errors: string[] = [];

    // Metric charts don't support groupBy
    if (config.groupBy) {
      errors.push('Metric number charts do not use groupBy - data is aggregated to a single value');
    }

    // Metric charts don't support multiple series
    if (config.multipleSeries && Array.isArray(config.multipleSeries) && config.multipleSeries.length > 0) {
      errors.push('Metric number charts do not support multiple series');
    }

    // Validate aggregation type if specified (Phase 3)
    if (config.aggregation) {
      const validAggregations: AggregationType[] = ['sum', 'avg', 'count', 'min', 'max'];
      const aggregation = config.aggregation as string;

      if (!validAggregations.includes(aggregation as AggregationType)) {
        errors.push(
          `Invalid aggregation type: ${aggregation}. Must be one of: ${validAggregations.join(', ')}`
        );
      }
    }

    return errors;
  }
}
