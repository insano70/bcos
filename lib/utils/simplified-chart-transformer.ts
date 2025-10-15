import type { AggAppMeasure, ChartData, ChartDataset } from '@/lib/types/analytics';
import { applyPeriodComparisonColors, getColorScheme } from './period-comparison-colors';
import type { ColumnConfig } from '@/lib/services/chart-config-service';
import {
  formatDateLabel,
} from './chart-data/formatters/date-formatter';
import {
  formatValue as formatValueUtil,
  formatValueCompact as formatValueCompactUtil,
} from './chart-data/formatters/value-formatter';
import {
  getColorPalette,
  adjustColorOpacity as adjustColorOpacityUtil,
} from './chart-data/services/chart-color-service';
import { chartTransformerFactory } from './chart-data/strategies/chart-transformer-factory';

/**
 * Simplified Chart Data Transformer
 * Works with pre-aggregated data from ih.agg_app_measures
 * Fully dynamic - uses database column metadata for grouping
 */

export class SimplifiedChartTransformer {
  private columnMetadata?: Map<string, ColumnConfig>;

  /**
   * Constructor
   * @param columnMetadata - Optional column metadata for dynamic grouping validation
   */
  constructor(columnMetadata?: Map<string, ColumnConfig>) {
    if (columnMetadata) {
      this.columnMetadata = columnMetadata;
    }
  }

  /**
   * Set column metadata for dynamic grouping validation
   * Use this to provide server-loaded metadata to the transformer
   */
  setColumnMetadata(columnMetadata: Map<string, ColumnConfig>): void {
    this.columnMetadata = columnMetadata;
  }

  /**
   * Extract measure type from data (assumes all records have same measure type)
   */
  private extractMeasureType(measures: AggAppMeasure[]): string {
    if (measures.length === 0) return 'number';

    // Get measure type from first record (all should be the same for a single chart)
    const measureType = measures[0]?.measure_type;
    return measureType || 'number'; // Default fallback
  }

  /**
   * Transform pre-aggregated data to Chart.js format
   *
   * Uses strategy pattern for all chart types.
   * No fallback logic - strategies must handle all cases.
   */
  transformData(
    measures: AggAppMeasure[],
    chartType:
      | 'line'
      | 'bar'
      | 'horizontal-bar'
      | 'progress-bar'
      | 'pie'
      | 'doughnut'
      | 'area'
      | 'table',
    groupBy: string = 'none',
    paletteId: string = 'default'
  ): ChartData {
    if (measures.length === 0) {
      return { labels: [], datasets: [] };
    }

    // Table charts don't use Chart.js transformation
    if (chartType === 'table') {
      return { labels: [], datasets: [] };
    }

    // Get strategy - throw if not found
    const strategy = chartTransformerFactory.getStrategy(chartType);
    if (!strategy) {
      throw new Error(`No transformation strategy found for chart type: ${chartType}`);
    }

    // Build configuration
    const config = {
      groupBy,
      paletteId,
      filled: chartType === 'area',
      ...(this.columnMetadata && { columnMetadata: this.columnMetadata }),
    };

    // Validate configuration
    const validation = strategy.validate(config);
    if (!validation.isValid) {
      throw new Error(
        `Invalid configuration for ${chartType}: ${validation.errors.join(', ')}`
      );
    }

    // Transform data with strategy
    const chartData = strategy.transform(measures, config);

    // Attach measure type metadata
    const measureType = this.extractMeasureType(measures);
    chartData.measureType = measureType;
    chartData.datasets.forEach((dataset) => {
      dataset.measureType = measureType;
    });

    return chartData;
  }

  /**
   * Enhanced multi-series support with better data handling
   * Uses MultiSeriesStrategy directly - no fallback logic
   */
  createEnhancedMultiSeriesChart(
    measures: AggAppMeasure[],
    groupBy: string,
    aggregations: Record<string, 'sum' | 'avg' | 'count' | 'min' | 'max'> = {},
    paletteId: string = 'default'
  ): ChartData {
    // Delegate to MultiSeriesStrategy
    const strategy = chartTransformerFactory.getStrategy('multi-series');
    if (!strategy) {
      throw new Error('No transformation strategy found for multi-series charts');
    }

    const config = {
      groupBy,
      paletteId,
      aggregations,
      ...(this.columnMetadata && { columnMetadata: this.columnMetadata }),
    };

    const validation = strategy.validate(config);
    if (!validation.isValid) {
      throw new Error(
        `Invalid configuration for multi-series: ${validation.errors.join(', ')}`
      );
    }

    const chartData = strategy.transform(measures, config);

    // Attach measure type metadata
    const measureType = this.extractMeasureType(measures);
    chartData.measureType = measureType;
    chartData.datasets.forEach((dataset) => {
      dataset.measureType = measureType;
    });

    return chartData;
  }

  /**
   * Create multi-series chart from tagged data (optimized for multiple measures)
   */
  createMultiSeriesFromTaggedData(
    measures: AggAppMeasure[], // Tagged measures with series_label, etc.
    aggregations: Record<string, 'sum' | 'avg' | 'count' | 'min' | 'max'> = {},
    paletteId: string = 'default'
  ): ChartData {
    // Group by series label and date
    const groupedBySeries = new Map<string, Map<string, number[]>>();
    const allDates = new Set<string>();

    measures.forEach((measure) => {
      const seriesLabel = measure.series_label || measure.measure || 'Unknown';
      const dateKey = measure.date_index;

      allDates.add(dateKey);

      if (!groupedBySeries.has(seriesLabel)) {
        groupedBySeries.set(seriesLabel, new Map());
      }

      const dateMap = groupedBySeries.get(seriesLabel);
      if (!dateMap) {
        throw new Error(`Date map not found for series: ${seriesLabel}`);
      }
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, []);
      }

      const measureValue =
        typeof measure.measure_value === 'string'
          ? parseFloat(measure.measure_value)
          : measure.measure_value;

      const dateValues = dateMap.get(dateKey);
      if (!dateValues) {
        throw new Error(`Date values not found for date key: ${dateKey}`);
      }
      dateValues.push(measureValue);
    });

    const sortedDates = Array.from(allDates).sort(
      (a, b) => new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()
    );

    const datasets: ChartDataset[] = [];
    const colors = getColorPalette(paletteId);
    let colorIndex = 0;

    groupedBySeries.forEach((dateMap, seriesLabel) => {
      const aggregationType = aggregations[seriesLabel] || 'sum';

      const data = sortedDates.map((dateIndex) => {
        const values = dateMap.get(dateIndex) || [0];

        switch (aggregationType) {
          case 'sum':
            return values.reduce((sum, val) => sum + val, 0);
          case 'avg':
            return values.reduce((sum, val) => sum + val, 0) / values.length;
          case 'count':
            return values.length;
          case 'min':
            return Math.min(...values);
          case 'max':
            return Math.max(...values);
          default:
            return values.reduce((sum, val) => sum + val, 0);
        }
      });

      // Find the series config to get custom color
      const sampleMeasure = measures.find((m) => m.series_label === seriesLabel);
      const customColor = sampleMeasure?.series_color;
      const color = customColor || colors[colorIndex % colors.length] || '#00AEEF';

      datasets.push({
        label: seriesLabel,
        data,
        borderColor: color,
        backgroundColor: color,
        fill: false,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 5,
        borderRadius: 4,
        barPercentage: 0.7,
        categoryPercentage: 0.7,
      });

      colorIndex++;
    });

    return {
      labels: sortedDates.map((dateStr) => {
        return formatDateLabel(dateStr, measures[0]?.frequency || 'Monthly');
      }),
      datasets,
    };
  }

  /**
   * Format value based on measure type
   * @deprecated Use formatValue from value-formatter directly
   */
  formatValue(value: number, measureType: string): string {
    return formatValueUtil(value, measureType);
  }

  /**
   * Format value with abbreviations for compact display (e.g., Y-axis labels)
   * Converts large numbers to K, M, B notation
   * @deprecated Use formatValueCompact from value-formatter directly
   */
  formatValueCompact(value: number, measureType: string): string {
    return formatValueCompactUtil(value, measureType);
  }

  /**
   * Transform data with period comparison support
   */
  transformDataWithPeriodComparison(
    measures: AggAppMeasure[],
    chartType:
      | 'line'
      | 'bar'
      | 'horizontal-bar'
      | 'progress-bar'
      | 'pie'
      | 'doughnut'
      | 'area'
      | 'table',
    groupBy: string = 'none',
    paletteId: string = 'default'
  ): ChartData {
    if (measures.length === 0) {
      return { labels: [], datasets: [] };
    }

    // Extract measure type from data
    const measureType = this.extractMeasureType(measures);

    // Check if we have period comparison data (series-tagged data)
    const hasPeriodComparison = measures.some(
      (m) => m.series_label && (m.series_id === 'current' || m.series_id === 'comparison')
    );

    if (hasPeriodComparison) {
      const chartData = this.createPeriodComparisonChart(measures, chartType, groupBy, paletteId);
      // Attach measure type to chart data and all datasets
      chartData.measureType = measureType;
      chartData.datasets.forEach((dataset) => {
        dataset.measureType = measureType;
      });
      return chartData;
    }

    // Fallback to regular transformation
    return this.transformData(measures, chartType, groupBy, paletteId);
  }

  /**
   * Create period comparison chart with distinct styling for current vs comparison periods
   */
  private createPeriodComparisonChart(
    measures: AggAppMeasure[],
    chartType:
      | 'line'
      | 'bar'
      | 'horizontal-bar'
      | 'progress-bar'
      | 'pie'
      | 'doughnut'
      | 'area'
      | 'table',
    groupBy: string = 'none',
    paletteId: string = 'default'
  ): ChartData {
    // Separate current and comparison data
    const currentMeasures = measures.filter((m) => m.series_id === 'current');
    const comparisonMeasures = measures.filter((m) => m.series_id === 'comparison');

    // Get comparison label from the data
    const comparisonLabel = comparisonMeasures[0]?.series_label || 'Previous Period';

    // Transform current period data
    const currentData = this.transformData(currentMeasures, chartType, groupBy, paletteId);

    // Transform comparison period data
    const comparisonData = this.transformData(comparisonMeasures, chartType, groupBy, paletteId);

    // Apply period comparison styling
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

    return {
      labels: currentData.labels, // Use current period labels as primary
      datasets: coloredDatasets,
    };
  }

  /**
   * Apply period comparison styling to comparison datasets
   */
  private applyPeriodComparisonStyling(
    chartData: ChartData,
    chartType:
      | 'line'
      | 'bar'
      | 'horizontal-bar'
      | 'progress-bar'
      | 'pie'
      | 'doughnut'
      | 'area'
      | 'table'
  ): ChartData {
    const styledDatasets = chartData.datasets.map((dataset) => {
      const styledDataset = { ...dataset };

      switch (chartType) {
        case 'line':
        case 'area':
          // Use dashed lines and lighter colors for comparison
          (styledDataset as ChartDataset & { borderDash?: number[] }).borderDash = [5, 5];
          styledDataset.borderColor = adjustColorOpacityUtil(dataset.borderColor as string, 0.6);
          styledDataset.backgroundColor = adjustColorOpacityUtil(
            dataset.backgroundColor as string,
            0.3
          );
          break;

        case 'bar':
        case 'horizontal-bar':
          // Use lighter colors and reduced opacity for comparison bars
          styledDataset.backgroundColor = adjustColorOpacityUtil(
            dataset.backgroundColor as string,
            0.6
          );
          styledDataset.hoverBackgroundColor = adjustColorOpacityUtil(
            dataset.hoverBackgroundColor as string,
            0.8
          );
          break;

        case 'pie':
        case 'doughnut':
          // Use lighter colors for comparison slices
          if (Array.isArray(styledDataset.backgroundColor)) {
            styledDataset.backgroundColor = styledDataset.backgroundColor.map((color) =>
              adjustColorOpacityUtil(color, 0.6)
            );
          }
          break;

        default:
          // Default styling - just reduce opacity
          styledDataset.backgroundColor = adjustColorOpacityUtil(
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

  /**
   * Transform data for dual-axis chart (bar + line combo)
   * Primary measure shows as bars on left y-axis
   * Secondary measure shows as line/bar on right y-axis
   * Uses DualAxisStrategy directly - no fallback logic
   */
  transformDualAxisData(
    primaryMeasures: AggAppMeasure[],
    secondaryMeasures: AggAppMeasure[],
    primaryLabel: string,
    secondaryLabel: string,
    secondaryChartType: 'line' | 'bar',
    _groupBy: string = 'none', // Reserved for future use
    paletteId: string = 'default'
  ): ChartData {
    if (primaryMeasures.length === 0 && secondaryMeasures.length === 0) {
      return { labels: [], datasets: [] };
    }

    // Get strategy - throw if not found
    const strategy = chartTransformerFactory.getStrategy('dual-axis');
    if (!strategy) {
      throw new Error('No transformation strategy found for dual-axis charts');
    }

    // Tag measures with series_id for strategy
    const taggedPrimary = primaryMeasures.map(m => ({ ...m, series_id: 'primary' as const }));
    const taggedSecondary = secondaryMeasures.map(m => ({ ...m, series_id: 'secondary' as const }));
    const combinedMeasures = [...taggedPrimary, ...taggedSecondary];

    const config = {
      paletteId,
      primaryLabel,
      secondaryLabel,
      secondaryChartType,
      ...(this.columnMetadata && { columnMetadata: this.columnMetadata }),
    };

    const validation = strategy.validate(config);
    if (!validation.isValid) {
      throw new Error(
        `Invalid configuration for dual-axis: ${validation.errors.join(', ')}`
      );
    }

    return strategy.transform(combinedMeasures, config);
  }
}

// Export singleton instance for backward compatibility
// Note: This instance does not have data source metadata loaded
// For dynamic grouping with column validation, create a new instance with dataSourceId
export const simplifiedChartTransformer = new SimplifiedChartTransformer();
