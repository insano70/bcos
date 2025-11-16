import { log } from '@/lib/logger';
import type { AggAppMeasure, ChartData } from '@/lib/types/analytics';
import { SimplifiedChartTransformer } from '@/lib/utils/simplified-chart-transformer';
import { providerColorService } from '@/lib/services/provider-color-service';
import { BaseChartHandler } from './base-handler';

/**
 * Bar Chart Handler
 *
 * Handles all bar chart variants.
 *
 * Supported chart types:
 * - bar: Standard vertical bar chart
 * - stacked-bar: Stacked vertical bar chart
 * - horizontal-bar: Horizontal bar chart
 *
 * Features:
 * - Multiple series support via groupBy
 * - Stacking modes (normal, percentage)
 * - Period comparison support
 * - Multiple series configuration
 */
export class BarChartHandler extends BaseChartHandler {
  type = 'bar'; // Primary type, but handles all bar variants

  /**
   * Check if this handler can handle the configuration
   */
  canHandle(config: Record<string, unknown>): boolean {
    const chartType = config.chartType as string;
    return chartType === 'bar' || chartType === 'stacked-bar' || chartType === 'horizontal-bar';
  }

  /**
   * Transform raw data into Chart.js format for bar charts
   */
  async transform(
    data: Record<string, unknown>[],
    config: Record<string, unknown>
  ): Promise<ChartData> {
    const startTime = Date.now();

    try {
      const chartType = config.chartType as 'bar' | 'stacked-bar' | 'horizontal-bar';
      const groupBy = this.getGroupBy(config);
      const colorPalette = this.getColorPalette(config);

      log.info('Transforming bar chart data', {
        chartType,
        recordCount: data.length,
        groupBy,
        colorPalette,
        stackingMode: config.stackingMode,
      });

      // NEW: Inject provider colors if grouping by provider
      if (groupBy === 'provider_name' || groupBy === 'provider_uid') {
        await this.injectProviderColors(data as AggAppMeasure[], config);
      }

      // Create transformer
      const transformer = new SimplifiedChartTransformer();

      // Map chart type for transformer
      // stacked-bar is handled as 'bar' by transformer (stacking is Chart.js config)
      const transformChartType = chartType === 'horizontal-bar' ? 'horizontal-bar' : 'bar';

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
          transformChartType,
          groupBy,
          colorPalette
        );
      }
      // Standard transformation
      else {
        chartData = transformer.transformData(
          data as AggAppMeasure[],
          transformChartType,
          groupBy,
          colorPalette
        );
      }

      const duration = Date.now() - startTime;

      log.info('Bar chart data transformed', {
        chartType,
        duration,
        datasetCount: chartData.datasets?.length ?? 0,
        labelCount: chartData.labels?.length ?? 0,
      });

      return chartData;
    } catch (error) {
      log.error('Failed to transform bar chart data', error, {
        chartType: config.chartType,
        recordCount: data.length,
      });

      throw error;
    }
  }

  /**
   * Custom validation for bar charts
   */
  protected validateCustom(config: Record<string, unknown>): string[] {
    const errors: string[] = [];

    // Validate chart type
    const chartType = config.chartType as string;
    if (chartType !== 'bar' && chartType !== 'stacked-bar' && chartType !== 'horizontal-bar') {
      errors.push(`Invalid chart type for bar chart handler: ${chartType}`);
    }

    // Validate stacking mode if stacked-bar
    if (chartType === 'stacked-bar' && config.stackingMode) {
      const stackingMode = config.stackingMode as string;
      if (stackingMode !== 'normal' && stackingMode !== 'percentage') {
        errors.push(`Invalid stacking mode: ${stackingMode}. Must be 'normal' or 'percentage'`);
      }
    }

    return errors;
  }

  /**
   * Inject provider colors into data rows
   * Sets series_color field for each row based on provider_uid
   *
   * @param data - Chart data (mutated in-place)
   * @param config - Chart configuration (for organizationId)
   */
  private async injectProviderColors(
    data: AggAppMeasure[],
    config: Record<string, unknown>
  ): Promise<void> {
    if (data.length === 0) {
      return;
    }

    // Extract unique providers from data
    const providers = this.extractUniqueProviders(data);

    if (providers.length === 0) {
      return;
    }

    // Get organization ID from config (if available)
    const organizationId = config.organizationId as string | undefined;

    // Bulk fetch colors
    const colorMap = await providerColorService.getBulkProviderColors(providers, organizationId);

    // Inject colors into data rows (mutate in-place)
    for (const row of data) {
      const providerUid = row.provider_uid as number | undefined;
      if (providerUid !== undefined && colorMap.has(providerUid)) {
        const color = colorMap.get(providerUid);
        if (color !== undefined) {
          row.series_color = color;
        }
      }
    }

    log.info('Provider colors injected into chart data', {
      providerCount: providers.length,
      rowCount: data.length,
      organizationId,
      operation: 'injectProviderColors',
      component: 'bar-chart-handler',
    });
  }

  /**
   * Extract unique providers from dataset
   *
   * @param data - Chart data
   * @returns Array of {provider_uid, provider_name}
   */
  private extractUniqueProviders(
    data: AggAppMeasure[]
  ): Array<{ provider_uid: number; provider_name: string }> {
    const providerMap = new Map<number, string>();

    for (const row of data) {
      const uid = row.provider_uid as number | undefined;
      const name = row.provider_name as string | undefined;

      if (uid !== undefined && name !== undefined) {
        providerMap.set(uid, name);
      }
    }

    return Array.from(providerMap.entries()).map(([provider_uid, provider_name]) => ({
      provider_uid,
      provider_name,
    }));
  }
}
