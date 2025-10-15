import type { AggAppMeasure, ChartData, ChartDataset } from '@/lib/types/analytics';
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
} from './chart-data/services/chart-color-service';
import { chartTransformerFactory } from './chart-data/strategies/chart-transformer-factory';

/**
 * Simplified Chart Data Transformer
 *
 * Primary transformer for converting pre-aggregated analytics data into Chart.js format.
 * Implements the Strategy pattern for type-safe, validated chart transformations.
 *
 * ## Features
 * - **Strategy-based**: Delegates to specialized strategies for each chart type
 * - **Type-safe**: Validates configurations before transformation
 * - **Measure type aware**: Automatically attaches formatting metadata
 * - **Dynamic grouping**: Uses database column metadata for validation
 * - **No fallbacks**: Throws clear errors instead of silent failures
 *
 * ## Supported Chart Types
 * - Line, Bar, Horizontal Bar, Progress Bar, Area
 * - Pie, Doughnut
 * - Multi-series (multiple measures/datasets)
 * - Dual-axis (combo charts with two y-axes)
 * - Period comparison (current vs. previous period)
 *
 * ## Architecture
 * This class is a facade over the chart transformation strategy system.
 * Each chart type has a dedicated strategy class that handles transformation logic.
 * See `lib/utils/chart-data/strategies/` for strategy implementations.
 *
 * @example
 * ```typescript
 * const transformer = new SimplifiedChartTransformer();
 * const chartData = transformer.transformData(measures, 'line', 'none', 'default');
 * ```
 *
 * @see {@link lib/utils/chart-data/strategies/chart-transformer-factory.ts} for strategy registry
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
   * Primary transformation method that delegates to chart-specific strategies.
   * Uses the Strategy pattern for type-safe, validated transformations.
   *
   * @param measures - Pre-aggregated data from ih.agg_app_measures
   * @param chartType - Chart type (line, bar, horizontal-bar, progress-bar, pie, doughnut, area, table)
   * @param groupBy - Field to group data by (default: 'none' for time-series)
   * @param paletteId - Color palette identifier (default: 'default')
   * @returns Chart.js formatted data with labels and datasets
   * @throws Error if no strategy found for chart type or configuration is invalid
   *
   * @example
   * ```typescript
   * const transformer = new SimplifiedChartTransformer();
   * const chartData = transformer.transformData(measures, 'line', 'none', 'default');
   * ```
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
   * Create multi-series chart with custom aggregations per series
   *
   * Handles charts with multiple measures or series-tagged data.
   * Supports custom aggregation strategies (sum, avg, count, min, max) per series.
   * Automatically detects series-tagged data (series_label) vs. grouped data.
   *
   * @param measures - Pre-aggregated data, optionally tagged with series_label
   * @param groupBy - Field to group data by (used for non-tagged data)
   * @param aggregations - Aggregation type per series (default: 'sum' for all)
   * @param paletteId - Color palette identifier (default: 'default')
   * @returns Chart.js formatted data with multiple datasets
   * @throws Error if configuration is invalid
   *
   * @example
   * ```typescript
   * const chartData = transformer.createEnhancedMultiSeriesChart(
   *   measures,
   *   'provider',
   *   { 'Series A': 'sum', 'Series B': 'avg' },
   *   'default'
   * );
   * ```
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
   * Create multi-series chart from tagged data (legacy support)
   *
   * Optimized for measures pre-tagged with series_label and series_color.
   * Groups data by series label and date, applying custom aggregations per series.
   * Preserves custom colors from series_color field.
   *
   * @param measures - Tagged measures with series_label, series_color, etc.
   * @param aggregations - Aggregation type per series label (default: 'sum' for all)
   * @param paletteId - Color palette identifier for series without custom colors
   * @returns Chart.js formatted data with multiple datasets
   *
   * @deprecated Use createEnhancedMultiSeriesChart() which auto-detects tagged data
   *
   * @example
   * ```typescript
   * const chartData = transformer.createMultiSeriesFromTaggedData(
   *   taggedMeasures,
   *   { 'Revenue': 'sum', 'Avg Cost': 'avg' },
   *   'default'
   * );
   * ```
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
   *
   * Automatically detects period comparison data (current vs. comparison periods)
   * and applies appropriate styling (dashed lines, reduced opacity for comparison).
   * Falls back to standard transformation if no period comparison data is detected.
   *
   * @param measures - Pre-aggregated data with optional series_id ('current' or 'comparison')
   * @param chartType - Chart type (line, bar, horizontal-bar, progress-bar, pie, doughnut, area, table)
   * @param groupBy - Field to group data by (default: 'none' for time-series)
   * @param paletteId - Color palette identifier (default: 'default')
   * @returns Chart.js formatted data with period comparison styling
   * @throws Error if no strategy found or configuration is invalid
   *
   * @example
   * ```typescript
   * // Measures tagged with series_id: 'current' and 'comparison'
   * const chartData = transformer.transformDataWithPeriodComparison(
   *   measures,
   *   'line',
   *   'none',
   *   'default'
   * );
   * ```
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

    // Check if we have period comparison data (series-tagged data)
    const hasPeriodComparison = measures.some(
      (m) => m.series_label && (m.series_id === 'current' || m.series_id === 'comparison')
    );

    if (hasPeriodComparison) {
      // Use PeriodComparisonStrategy
      const strategy = chartTransformerFactory.getStrategy('period-comparison');
      if (!strategy) {
        throw new Error('No transformation strategy found for period-comparison charts');
      }

      const config = {
        chartType,
        groupBy,
        paletteId,
        ...(this.columnMetadata && { columnMetadata: this.columnMetadata }),
      };

      const validation = strategy.validate(config);
      if (!validation.isValid) {
        throw new Error(
          `Invalid configuration for period-comparison: ${validation.errors.join(', ')}`
        );
      }

      return strategy.transform(measures, config);
    }

    // Fallback to regular transformation
    return this.transformData(measures, chartType, groupBy, paletteId);
  }

  /**
   * Transform data for dual-axis chart (combo chart)
   *
   * Creates charts with two y-axes for comparing measures with different scales.
   * Primary measure renders on left y-axis, secondary on right y-axis.
   * Supports bar+line, bar+bar combinations.
   *
   * @param primaryMeasures - Primary dataset (left y-axis, rendered as bars)
   * @param secondaryMeasures - Secondary dataset (right y-axis, line or bar)
   * @param primaryLabel - Label for primary dataset
   * @param secondaryLabel - Label for secondary dataset
   * @param secondaryChartType - Chart type for secondary axis ('line' or 'bar')
   * @param _groupBy - Reserved for future grouping support (currently unused)
   * @param paletteId - Color palette identifier (default: 'default')
   * @returns Chart.js formatted data with yAxisID metadata for dual-axis rendering
   * @throws Error if no strategy found or configuration is invalid
   *
   * @example
   * ```typescript
   * const chartData = transformer.transformDualAxisData(
   *   revenueMeasures,
   *   costMeasures,
   *   'Revenue',
   *   'Cost',
   *   'line',
   *   'none',
   *   'default'
   * );
   * ```
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
