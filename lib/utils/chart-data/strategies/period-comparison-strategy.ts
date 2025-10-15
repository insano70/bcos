/**
 * Period Comparison Strategy
 *
 * Handles transformation for period comparison charts.
 * Separates current and comparison period data, applies distinct styling,
 * and merges them into a single chart with appropriate labeling.
 */

import type { AggAppMeasure, ChartData, ChartDataset } from '@/lib/types/analytics';
import { BaseChartTransformStrategy, type TransformConfig } from './base-strategy';
import { chartTransformerFactory } from './chart-transformer-factory';
import { applyPeriodComparisonColors, getColorScheme } from '../../period-comparison-colors';
import { adjustColorOpacity } from '../services/chart-color-service';

/**
 * Configuration for period comparison charts
 */
interface PeriodComparisonConfig extends TransformConfig {
  chartType: 'line' | 'bar' | 'horizontal-bar' | 'progress-bar' | 'pie' | 'doughnut' | 'area' | 'table';
}

/**
 * Period Comparison Chart Transformation Strategy
 * Composes base strategies with period comparison styling
 */
export class PeriodComparisonStrategy extends BaseChartTransformStrategy {
  readonly type = 'period-comparison';

  canHandle(chartType: string): boolean {
    return chartType === 'period-comparison';
  }

  validate(config: PeriodComparisonConfig): { isValid: boolean; errors: string[] } {
    const baseValidation = super.validate(config);
    const errors = [...baseValidation.errors];

    if (!config.chartType) {
      errors.push('Period comparison requires a base chartType');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  transform(measures: AggAppMeasure[], config: PeriodComparisonConfig): ChartData {
    if (measures.length === 0) {
      return { labels: [], datasets: [] };
    }

    const { chartType, groupBy = 'none', paletteId = 'default' } = config;

    // Separate current and comparison data
    const currentMeasures = measures.filter((m) => m.series_id === 'current');
    const comparisonMeasures = measures.filter((m) => m.series_id === 'comparison');

    // Get comparison label from the data
    const comparisonLabel = comparisonMeasures[0]?.series_label || 'Previous Period';

    // Get the base strategy for the chart type
    const baseStrategy = chartTransformerFactory.getStrategy(chartType);
    if (!baseStrategy) {
      throw new Error(`No strategy found for chart type: ${chartType}`);
    }

    // Build config for base strategy
    const baseConfig = {
      groupBy,
      paletteId,
      filled: chartType === 'area',
      ...(config.columnMetadata && { columnMetadata: config.columnMetadata }),
    };

    // Transform current period data using base strategy
    const currentData = baseStrategy.transform(currentMeasures, baseConfig);

    // Transform comparison period data using base strategy
    const comparisonData = baseStrategy.transform(comparisonMeasures, baseConfig);

    // Apply period comparison styling to comparison data
    const styledComparisonData = this.applyPeriodComparisonStyling(comparisonData, chartType);

    // Merge datasets with appropriate labeling
    const mergedDatasets = [
      ...currentData.datasets.map((dataset) => ({
        ...dataset,
        label: dataset.label === 'Value' ? 'Current Period' : dataset.label,
      })),
      ...styledComparisonData.datasets.map((dataset) => ({
        ...dataset,
        label:
          dataset.label === 'Value' ? comparisonLabel : `${dataset.label} (${comparisonLabel})`,
      })),
    ];

    // Apply period comparison color scheme
    const colorScheme = getColorScheme('default');
    const coloredDatasets = applyPeriodComparisonColors(
      mergedDatasets,
      colorScheme,
      chartType
    ) as ChartDataset[];

    const chartData: ChartData = {
      labels: currentData.labels, // Use current period labels as primary
      datasets: coloredDatasets,
    };

    // Attach measure type
    const measureType = this.extractMeasureType(measures);
    return this.attachMeasureType(chartData, measureType);
  }

  /**
   * Apply period comparison styling to comparison datasets
   */
  private applyPeriodComparisonStyling(
    chartData: ChartData,
    chartType: string
  ): ChartData {
    const styledDatasets = chartData.datasets.map((dataset) => {
      const styledDataset = { ...dataset };

      switch (chartType) {
        case 'line':
        case 'area':
          // Use dashed lines and lighter colors for comparison
          (styledDataset as ChartDataset & { borderDash?: number[] }).borderDash = [5, 5];
          styledDataset.borderColor = adjustColorOpacity(dataset.borderColor as string, 0.6);
          styledDataset.backgroundColor = adjustColorOpacity(
            dataset.backgroundColor as string,
            0.3
          );
          break;

        case 'bar':
        case 'horizontal-bar':
          // Use lighter colors and reduced opacity for comparison bars
          styledDataset.backgroundColor = adjustColorOpacity(
            dataset.backgroundColor as string,
            0.6
          );
          styledDataset.hoverBackgroundColor = adjustColorOpacity(
            dataset.hoverBackgroundColor as string,
            0.8
          );
          break;

        case 'pie':
        case 'doughnut':
          // Use lighter colors for comparison slices
          if (Array.isArray(styledDataset.backgroundColor)) {
            styledDataset.backgroundColor = styledDataset.backgroundColor.map((color) =>
              adjustColorOpacity(color, 0.6)
            );
          }
          break;

        default:
          // Default styling - just reduce opacity
          styledDataset.backgroundColor = adjustColorOpacity(
            dataset.backgroundColor as string,
            0.6
          );
      }

      return styledDataset;
    });

    return {
      ...chartData,
      datasets: styledDatasets,
    };
  }
}
