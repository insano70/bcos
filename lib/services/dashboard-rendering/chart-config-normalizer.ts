/**
 * Chart Config Normalizer
 *
 * Normalizes chart configurations by:
 * - Applying template defaults
 * - Flattening nested fields (series.* → top-level)
 * - Merging universal filters
 * - Handling chart-type-specific configurations
 *
 * Single Responsibility:
 * - Normalize chart config structure
 * - Apply template defaults
 * - Flatten nested config
 * - Merge universal filters
 */

import type { ChartDefinition, ResolvedFilters } from './types';
import { configTemplatesRegistry } from './config-templates';

/**
 * Chart config with typed nested fields
 */
interface TypedChartConfig {
  series?: {
    groupBy?: string;
    colorPalette?: string;
  };
  groupBy?: string;
  colorPalette?: string;
  dualAxisConfig?: unknown;
  aggregation?: string;
  target?: number;
  stackingMode?: string;
  dataSourceId?: number;
  seriesConfigs?: unknown[];
  frequency?: string;
}

/**
 * Chart Config Normalizer
 *
 * Transforms chart configurations from stored format to execution format.
 * Handles template defaults, nested field flattening, and filter merging.
 */
export class ChartConfigNormalizer {
  /**
   * Normalize chart config
   *
   * Applies transformations in this order:
   * 1. Apply template defaults
   * 2. Merge with actual chart config (config takes precedence)
   * 3. Flatten nested fields (series.* → top-level)
   * 4. Extract chart-type-specific configs
   * 5. Merge universal filters
   *
   * @param chart - Chart definition
   * @param universalFilters - Dashboard-level filters
   * @returns Normalized config
   */
  normalize(
    chart: ChartDefinition,
    universalFilters: ResolvedFilters
  ): Record<string, unknown> {
    const chartConfigTyped = chart.chart_config as TypedChartConfig;

    // 1. Apply template defaults first
    const baseConfig: Record<string, unknown> = {
      chartType: chart.chart_type,
      dataSourceId: chartConfigTyped.dataSourceId || 0,
    };

    const configWithDefaults = configTemplatesRegistry.applyTemplate(
      chart.chart_type,
      baseConfig
    );

    // 2. Merge with actual chart config (chart config takes precedence)
    const config: Record<string, unknown> = {
      ...configWithDefaults,
      ...(typeof chart.chart_config === 'object' && chart.chart_config !== null
        ? (chart.chart_config as Record<string, unknown>)
        : {}),
      chartType: chart.chart_type,
      dataSourceId: chartConfigTyped.dataSourceId || 0,
    };

    // 3. Flatten nested fields
    this.flattenSeriesConfig(config, chart.chart_type, chartConfigTyped);

    // 4. Extract chart-type-specific configs
    this.extractChartTypeConfigs(config, chart.chart_type, chartConfigTyped);

    // 5. Merge universal filters
    this.mergeUniversalFilters(config, universalFilters);

    return config;
  }

  /**
   * Flatten series.* fields to top-level
   *
   * Legacy chart configs store groupBy and colorPalette in series object.
   * This flattens them to top-level for consistent access.
   *
   * Exception: Number charts don't use groupBy, so it's excluded.
   *
   * @param config - Config object to modify
   * @param chartType - Chart type
   * @param chartConfigTyped - Typed chart config
   */
  private flattenSeriesConfig(
    config: Record<string, unknown>,
    chartType: string,
    chartConfigTyped: TypedChartConfig
  ): void {
    // Flatten series.groupBy (except for number charts)
    if (chartType !== 'number' && chartConfigTyped.series?.groupBy) {
      config.groupBy = chartConfigTyped.series.groupBy;
    }

    // Flatten series.colorPalette
    if (chartConfigTyped.series?.colorPalette) {
      config.colorPalette = chartConfigTyped.series.colorPalette;
    }
  }

  /**
   * Extract chart-type-specific configurations
   *
   * Different chart types have different configuration requirements:
   * - dual-axis: Requires dualAxisConfig
   * - progress-bar: Uses aggregation and target
   * - bar/stacked-bar: Uses stackingMode
   * - multi-series: Uses seriesConfigs
   *
   * @param config - Config object to modify
   * @param chartType - Chart type
   * @param chartConfigTyped - Typed chart config
   */
  private extractChartTypeConfigs(
    config: Record<string, unknown>,
    chartType: string,
    chartConfigTyped: TypedChartConfig
  ): void {
    // Dual-axis config
    if (chartType === 'dual-axis' && chartConfigTyped.dualAxisConfig) {
      config.dualAxisConfig = chartConfigTyped.dualAxisConfig;
    }

    // Progress bar config
    if (chartType === 'progress-bar') {
      if (chartConfigTyped.aggregation) {
        config.aggregation = chartConfigTyped.aggregation;
      }
      if (chartConfigTyped.target !== undefined) {
        config.target = chartConfigTyped.target;
      }
    }

    // Stacking mode (for bar/stacked-bar charts)
    if (chartConfigTyped.stackingMode) {
      config.stackingMode = chartConfigTyped.stackingMode;
    }

    // Multi-series support (seriesConfigs → multipleSeries)
    if (chartConfigTyped.seriesConfigs?.length) {
      config.multipleSeries = chartConfigTyped.seriesConfigs;
    }
  }

  /**
   * Merge universal filters into config
   *
   * Dashboard-level filters override chart-level filters.
   * Only non-empty practiceUids arrays are included (security measure).
   *
   * @param config - Config object to modify
   * @param universalFilters - Dashboard-level filters
   */
  private mergeUniversalFilters(
    config: Record<string, unknown>,
    universalFilters: ResolvedFilters
  ): void {
    if (universalFilters.startDate !== undefined) {
      config.startDate = universalFilters.startDate;
    }

    if (universalFilters.endDate !== undefined) {
      config.endDate = universalFilters.endDate;
    }

    if (universalFilters.dateRangePreset !== undefined) {
      config.dateRangePreset = universalFilters.dateRangePreset;
    }

    if (universalFilters.organizationId !== undefined) {
      config.organizationId = universalFilters.organizationId;
    }

    // SECURITY: Only pass practiceUids if they exist and have values
    // Empty arrays should NOT be passed to prevent unfiltered queries
    if (
      universalFilters.practiceUids &&
      universalFilters.practiceUids.length > 0
    ) {
      config.practiceUids = universalFilters.practiceUids;
    }

    if (universalFilters.providerName !== undefined) {
      config.providerName = universalFilters.providerName;
    }
  }
}
