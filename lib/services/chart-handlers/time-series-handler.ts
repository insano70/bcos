import { log } from '@/lib/logger';
import type { AggAppMeasure, ChartData } from '@/lib/types/analytics';
import { SimplifiedChartTransformer } from '@/lib/utils/simplified-chart-transformer';
import { BaseChartHandler } from './base-handler';

/**
 * Time Series Chart Handler
 *
 * Handles line and area charts with time-based X-axis.
 *
 * Supported chart types:
 * - line: Standard line chart
 * - area: Filled area chart
 *
 * Features:
 * - Time-based X-axis
 * - Multiple series support via groupBy
 * - Period comparison support
 * - Multiple series configuration
 */
export class TimeSeriesChartHandler extends BaseChartHandler {
  type = 'line'; // Primary type, but handles both line and area

  /**
   * Check if this handler can handle the configuration
   */
  canHandle(config: Record<string, unknown>): boolean {
    const chartType = config.chartType as string;
    return chartType === 'line' || chartType === 'area';
  }

  /**
   * Transform raw data into Chart.js format for time series
   */
  transform(data: Record<string, unknown>[], config: Record<string, unknown>): ChartData {
    const startTime = Date.now();

    try {
      const chartType = config.chartType as 'line' | 'area';
      const groupBy = this.getGroupBy(config);
      const colorPalette = this.getColorPalette(config);

      log.info('Transforming time series chart data', {
        chartType,
        recordCount: data.length,
        groupBy,
        colorPalette,
      });

      // Create transformer
      const transformer = new SimplifiedChartTransformer();

      // Determine if filled (area chart)
      const filled = chartType === 'area';

      // Handle different transformation scenarios
      let chartData: ChartData;

      // Check for multiple series configuration
      if (
        config.multipleSeries &&
        Array.isArray(config.multipleSeries) &&
        config.multipleSeries.length > 0
      ) {
        const aggregations: Record<string, 'sum' | 'avg' | 'count' | 'min' | 'max'> = {};
        config.multipleSeries.forEach((series: Record<string, unknown>) => {
          if (series.label && series.aggregation) {
            aggregations[series.label as string] = series.aggregation as
              | 'sum'
              | 'avg'
              | 'count'
              | 'min'
              | 'max';
          }
        });

        chartData = transformer.createEnhancedMultiSeriesChart(
          data as AggAppMeasure[],
          'measure',
          aggregations,
          colorPalette
        );
      }
      // Check for period comparison
      else if (
        data.some((record) => record.series_id === 'current' || record.series_id === 'comparison')
      ) {
        chartData = transformer.transformDataWithPeriodComparison(
          data as AggAppMeasure[],
          'line',
          groupBy,
          colorPalette
        );
      }
      // Standard transformation
      else {
        chartData = transformer.transformData(
          data as AggAppMeasure[],
          filled ? 'area' : 'line',
          groupBy,
          colorPalette
        );
      }

      const duration = Date.now() - startTime;

      log.info('Time series chart data transformed', {
        chartType,
        duration,
        datasetCount: chartData.datasets?.length ?? 0,
        labelCount: chartData.labels?.length ?? 0,
      });

      return chartData;
    } catch (error) {
      log.error('Failed to transform time series chart data', error, {
        chartType: config.chartType,
        recordCount: data.length,
      });

      throw error;
    }
  }

  /**
   * Custom validation for time series charts
   */
  protected validateCustom(config: Record<string, unknown>): string[] {
    const errors: string[] = [];

    // Validate chart type
    const chartType = config.chartType as string;
    if (chartType !== 'line' && chartType !== 'area') {
      errors.push(`Invalid chart type for time series handler: ${chartType}`);
    }

    return errors;
  }
}
