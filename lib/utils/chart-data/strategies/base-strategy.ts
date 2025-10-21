/**
 * Base Chart Transform Strategy
 *
 * Defines the interface for chart-specific transformation strategies.
 * Each chart type implements this interface with its own transformation logic.
 */

import type { ColumnConfig } from '@/lib/services/chart-config-service';
import type { AggAppMeasure, ChartData } from '@/lib/types/analytics';

/**
 * Configuration for chart transformation
 */
export interface TransformConfig {
  groupBy?: string;
  paletteId?: string;
  filled?: boolean; // For area charts
  columnMetadata?: Map<string, ColumnConfig>;
  aggregation?: 'sum' | 'avg' | 'count' | 'min' | 'max';
  target?: number; // For progress bars
  [key: string]: unknown; // Allow additional config
}

/**
 * Chart Transform Strategy Interface
 *
 * All chart type strategies must implement this interface.
 */
export interface ChartTransformStrategy {
  /**
   * Unique identifier for this strategy
   */
  readonly type: string;

  /**
   * Transform pre-aggregated data to Chart.js format
   *
   * @param measures - Array of pre-aggregated measure records
   * @param config - Transformation configuration
   * @returns Chart.js compatible data structure
   */
  transform(measures: AggAppMeasure[], config: TransformConfig): ChartData;

  /**
   * Check if this strategy can handle the given chart type
   *
   * @param chartType - Chart type identifier
   * @returns True if this strategy handles the chart type
   */
  canHandle(chartType: string): boolean;

  /**
   * Validate configuration for this chart type
   *
   * @param config - Configuration to validate
   * @returns Validation result with errors if invalid
   */
  validate(config: TransformConfig): { isValid: boolean; errors: string[] };
}

/**
 * Abstract base class for chart transform strategies
 * Provides common functionality for all strategies
 */
export abstract class BaseChartTransformStrategy implements ChartTransformStrategy {
  abstract readonly type: string;

  abstract transform(measures: AggAppMeasure[], config: TransformConfig): ChartData;

  abstract canHandle(chartType: string): boolean;

  /**
   * Default validation implementation
   * Override in subclasses for specific validation logic
   */
  validate(config: TransformConfig): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Basic validation - can be extended by subclasses
    if (!config) {
      errors.push('Configuration is required');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Extract measure type from data (assumes all records have same measure type)
   */
  protected extractMeasureType(measures: AggAppMeasure[]): string {
    if (measures.length === 0) return 'number';
    const measureType = measures[0]?.measure_type;
    return typeof measureType === 'string' ? measureType : 'number';
  }

  /**
   * Attach measure type to chart data and datasets
   */
  protected attachMeasureType(chartData: ChartData, measureType: string): ChartData {
    chartData.measureType = measureType;
    chartData.datasets.forEach((dataset) => {
      dataset.measureType = measureType;
    });
    return chartData;
  }

  /**
   * Sort measures by date chronologically
   */
  protected sortMeasuresByDate(measures: AggAppMeasure[]): AggAppMeasure[] {
    return measures.sort(
      (a, b) =>
        new Date(`${a.date_index}T00:00:00`).getTime() -
        new Date(`${b.date_index}T00:00:00`).getTime()
    );
  }

  /**
   * Get default palette ID from config
   */
  protected getPaletteId(config: TransformConfig): string {
    return config.paletteId || 'default';
  }

  /**
   * Get groupBy field from config
   */
  protected getGroupBy(config: TransformConfig): string {
    return config.groupBy || 'none';
  }

  /**
   * Parse measure value to number (handles both string and number inputs)
   */
  protected parseValue(value: string | number): number {
    return typeof value === 'string' ? parseFloat(value) : value;
  }

  /**
   * Get group key for a measure with column metadata validation
   */
  protected getGroupKey(measure: AggAppMeasure, groupBy: string, config: TransformConfig): string {
    // Use column metadata if available for validation
    if (config.columnMetadata) {
      const columnConfig = config.columnMetadata.get(groupBy);
      if (columnConfig && !columnConfig.isGroupable) {
        console.warn(
          `Field '${groupBy}' (${columnConfig.displayName}) is not marked as groupable in data source configuration`
        );
      }
    }

    // Import and use the utility function
    // Note: getGroupValue is imported from data-aggregator
    const value = (measure as Record<string, unknown>)[groupBy];

    if (value == null || value === '') {
      const formattedFieldName = groupBy
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      return `Unknown ${formattedFieldName}`;
    }

    return typeof value === 'string' ? value : String(value);
  }

  /**
   * Extract and sort dates chronologically from measures
   */
  protected extractAndSortDates(measures: AggAppMeasure[]): string[] {
    const allDates = new Set<string>();
    measures.forEach((m) => {
      allDates.add((m.date_index ?? m.date_value ?? '') as string);
    });
    return Array.from(allDates).sort(
      (a, b) => new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()
    );
  }

  /**
   * Extract time period/frequency value from measures
   * Dynamically checks common field names: time_period, frequency
   */
  protected extractTimePeriod(measures: AggAppMeasure[]): string {
    if (measures.length === 0) return 'Monthly';

    const firstMeasure = measures[0] as Record<string, unknown>;

    // Check time_period field first (preferred)
    if (firstMeasure.time_period && typeof firstMeasure.time_period === 'string') {
      return firstMeasure.time_period;
    }

    // Fallback to frequency field
    if (firstMeasure.frequency && typeof firstMeasure.frequency === 'string') {
      return firstMeasure.frequency;
    }

    // Default fallback
    return 'Monthly';
  }
}
