import { log } from '@/lib/logger';
import type { AggAppMeasure, ChartData } from '@/lib/types/analytics';
import { SimplifiedChartTransformer } from '@/lib/utils/simplified-chart-transformer';
import { BaseChartHandler } from './base-handler';

/**
 * Distribution Chart Handler
 * Handles pie and doughnut chart types with categorical data distribution
 */
export class DistributionChartHandler extends BaseChartHandler {
  type = 'pie';

  canHandle(config: Record<string, unknown>): boolean {
    const chartType = config.chartType as string;
    return chartType === 'pie' || chartType === 'doughnut';
  }

  transform(data: Record<string, unknown>[], config: Record<string, unknown>): ChartData {
    const startTime = Date.now();

    try {
      const groupBy = config.groupBy as string | undefined;
      const colorPalette = (config.colorPalette as string) || 'default';
      const chartType = config.chartType as 'pie' | 'doughnut';

      log.info('Transforming distribution chart data', {
        chartType,
        recordCount: data.length,
        groupBy,
        colorPalette,
      });

      // For distribution charts, we need categorical grouping
      // Transform the data using the existing transformer
      const transformer = new SimplifiedChartTransformer();
      const chartData = transformer.transformData(
        data as AggAppMeasure[],
        chartType,
        groupBy,
        colorPalette
      );

      const duration = Date.now() - startTime;

      log.info('Distribution chart data transformed', {
        chartType,
        duration,
        datasetCount: chartData.datasets?.length ?? 0,
        labelCount: chartData.labels?.length ?? 0,
      });

      return chartData;
    } catch (error) {
      log.error('Failed to transform distribution chart data', error, {
        chartType: config.chartType,
        recordCount: data.length,
      });

      throw error;
    }
  }

  protected validateCustom(config: Record<string, unknown>): string[] {
    const errors: string[] = [];

    // Distribution charts require groupBy to categorize data
    if (!config.groupBy) {
      errors.push('groupBy field is required for pie/doughnut charts to categorize data');
    }

    // Validate groupBy is a string
    if (config.groupBy && typeof config.groupBy !== 'string') {
      errors.push('groupBy must be a string field name');
    }

    // Distribution charts don't support multiple series
    if (
      config.multipleSeries &&
      Array.isArray(config.multipleSeries) &&
      config.multipleSeries.length > 0
    ) {
      errors.push('Distribution charts (pie/doughnut) do not support multiple series');
    }

    // Distribution charts don't support period comparison
    if (config.periodComparison) {
      errors.push('Distribution charts (pie/doughnut) do not support period comparison');
    }

    return errors;
  }
}
