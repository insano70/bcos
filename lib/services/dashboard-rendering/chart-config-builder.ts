/**
 * Chart Config Builder Service
 *
 * Responsible for extracting, normalizing, and building chart execution configs.
 *
 * Single Responsibility:
 * - Extract filters from data_source
 * - Build runtime filters
 * - Flatten nested config (series.* → top-level)
 * - Handle chart-type-specific configs
 * - Multi-series support
 */

import { log } from '@/lib/logger';
import type { ChartDefinition, ChartExecutionConfig, ResolvedFilters } from './types';

/**
 * Data source filter (from chart definition)
 */
interface DataSourceFilter {
  field: string;
  operator?: string;
  value?: unknown;
}

/**
 * Chart Config Builder Service
 *
 * Builds execution configs for charts by:
 * - Extracting filters from data_source
 * - Building runtime filters
 * - Normalizing chart config
 */
export class ChartConfigBuilderService {
  /**
   * Build execution configs for all charts
   *
   * @param charts - Chart definitions
   * @param universalFilters - Dashboard-level filters
   * @returns Array of chart execution configs
   */
  buildChartConfigs(
    charts: ChartDefinition[],
    universalFilters: ResolvedFilters
  ): ChartExecutionConfig[] {
    return charts.map((chart) => this.buildSingleChartConfig(chart, universalFilters));
  }

  /**
   * Build execution config for a single chart
   *
   * @param chart - Chart definition
   * @param universalFilters - Dashboard-level filters
   * @returns Chart execution config
   */
  private buildSingleChartConfig(
    chart: ChartDefinition,
    universalFilters: ResolvedFilters
  ): ChartExecutionConfig {
    // 1. Extract filters from data_source
    const dataSourceFilters = this.extractDataSourceFilters(chart);

    // 2. Extract chart config for frequency fallback
    const chartConfig = chart.chart_config as { frequency?: string } | undefined;

    // 3. Build runtime filters
    const runtimeFilters = this.buildRuntimeFilters(dataSourceFilters, universalFilters, chartConfig);

    // 4. Normalize chart config
    const normalizedConfig = this.normalizeChartConfig(chart, universalFilters);

    // 4. Build metadata
    const metadata = this.extractMetadata(dataSourceFilters, chart);

    log.debug('Chart config built', {
      chartId: chart.chart_definition_id,
      chartName: chart.chart_name,
      chartType: chart.chart_type,
      hasGroupBy: Boolean(normalizedConfig.groupBy),
      groupByValue: normalizedConfig.groupBy,
      runtimeFilterKeys: Object.keys(runtimeFilters),
      component: 'dashboard-rendering',
    });

    return {
      chartId: chart.chart_definition_id,
      chartName: chart.chart_name,
      chartType: chart.chart_type,
      finalChartConfig: normalizedConfig,
      runtimeFilters,
      metadata,
    };
  }

  /**
   * Extract filters from chart's data_source
   *
   * @param chart - Chart definition
   * @returns Extracted filters
   */
  private extractDataSourceFilters(chart: ChartDefinition) {
    const dataSource =
      (chart.data_source as {
        filters?: DataSourceFilter[];
        advancedFilters?: unknown[];
      }) || {};

    const filters = dataSource.filters || [];

    return {
      measure: filters.find((f) => f.field === 'measure'),
      frequency: filters.find((f) => f.field === 'frequency'),
      practice: filters.find((f) => f.field === 'practice_uid'),
      startDate: filters.find((f) => f.field === 'date_index' && f.operator === 'gte'),
      endDate: filters.find((f) => f.field === 'date_index' && f.operator === 'lte'),
      advancedFilters: dataSource.advancedFilters || [],
    };
  }

  /**
   * Build runtime filters (chart filters + universal overrides)
   *
   * @param dataSourceFilters - Filters extracted from data_source
   * @param universalFilters - Dashboard-level filters
   * @param chartConfig - Chart config for fallback values
   * @returns Runtime filters object
   */
  private buildRuntimeFilters(
    dataSourceFilters: ReturnType<typeof this.extractDataSourceFilters>,
    universalFilters: ResolvedFilters,
    chartConfig?: { frequency?: string }
  ): Record<string, unknown> {
    const runtimeFilters: Record<string, unknown> = {};

    // Extract from data_source
    if (dataSourceFilters.measure?.value) {
      runtimeFilters.measure = dataSourceFilters.measure.value;
    }
    if (dataSourceFilters.frequency?.value) {
      runtimeFilters.frequency = dataSourceFilters.frequency.value;
    }
    // Fallback to chart_config.frequency for multi-series/dual-axis charts
    else if (chartConfig?.frequency) {
      runtimeFilters.frequency = chartConfig.frequency;
    }
    if (dataSourceFilters.practice?.value) {
      runtimeFilters.practiceUid = dataSourceFilters.practice.value;
    }
    if (dataSourceFilters.startDate?.value) {
      runtimeFilters.startDate = dataSourceFilters.startDate.value;
    }
    if (dataSourceFilters.endDate?.value) {
      runtimeFilters.endDate = dataSourceFilters.endDate.value;
    }

    // Advanced filters
    if (Array.isArray(dataSourceFilters.advancedFilters) && dataSourceFilters.advancedFilters.length > 0) {
      runtimeFilters.advancedFilters = dataSourceFilters.advancedFilters;
    }

    // Universal filters override chart-level filters
    if (universalFilters.startDate) {
      runtimeFilters.startDate = universalFilters.startDate;
    }
    if (universalFilters.endDate) {
      runtimeFilters.endDate = universalFilters.endDate;
    }

    // SECURITY-CRITICAL: Only pass through practice_uids if they exist and have values
    // Empty arrays should NOT be passed (no filter applied = query all practices)
    if (universalFilters.practiceUids && universalFilters.practiceUids.length > 0) {
      runtimeFilters.practiceUids = universalFilters.practiceUids;
    }

    return runtimeFilters;
  }

  /**
   * Normalize chart config (flatten nested fields, merge filters)
   *
   * @param chart - Chart definition
   * @param universalFilters - Dashboard-level filters
   * @returns Normalized config
   */
  private normalizeChartConfig(
    chart: ChartDefinition,
    universalFilters: ResolvedFilters
  ): Record<string, unknown> {
    const chartConfigTyped = chart.chart_config as {
      series?: { groupBy?: string; colorPalette?: string };
      groupBy?: string;
      colorPalette?: string;
      dualAxisConfig?: unknown;
      aggregation?: string;
      target?: number;
      stackingMode?: string;
      dataSourceId?: number;
      seriesConfigs?: unknown[];
      frequency?: string;
    };

    const config: Record<string, unknown> = {
      ...(typeof chart.chart_config === 'object' && chart.chart_config !== null
        ? (chart.chart_config as Record<string, unknown>)
        : {}),
      chartType: chart.chart_type,
      dataSourceId: chartConfigTyped.dataSourceId || 0,
    };

    // Flatten series.groupBy to top-level (except for number charts)
    if (chart.chart_type !== 'number' && chartConfigTyped.series?.groupBy) {
      config.groupBy = chartConfigTyped.series.groupBy;
    }

    // Flatten series.colorPalette
    if (chartConfigTyped.series?.colorPalette) {
      config.colorPalette = chartConfigTyped.series.colorPalette;
    }

    // Chart-type-specific configs
    if (chart.chart_type === 'dual-axis' && chartConfigTyped.dualAxisConfig) {
      config.dualAxisConfig = chartConfigTyped.dualAxisConfig;
    }

    if (chart.chart_type === 'progress-bar') {
      if (chartConfigTyped.aggregation) {
        config.aggregation = chartConfigTyped.aggregation;
      }
      if (chartConfigTyped.target !== undefined) {
        config.target = chartConfigTyped.target;
      }
    }

    if (chartConfigTyped.stackingMode) {
      config.stackingMode = chartConfigTyped.stackingMode;
    }

    // Multi-series support (seriesConfigs → multipleSeries)
    if (chartConfigTyped.seriesConfigs?.length) {
      config.multipleSeries = chartConfigTyped.seriesConfigs;
    }

    // Merge universal filters
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
    // Only pass practiceUids if they exist and have values
    if (universalFilters.practiceUids && universalFilters.practiceUids.length > 0) {
      config.practiceUids = universalFilters.practiceUids;
    }
    if (universalFilters.providerName !== undefined) {
      config.providerName = universalFilters.providerName;
    }

    return config;
  }

  /**
   * Extract metadata for result tracking
   *
   * @param dataSourceFilters - Filters extracted from data_source
   * @param chart - Chart definition
   * @returns Metadata object
   */
  private extractMetadata(
    dataSourceFilters: ReturnType<typeof this.extractDataSourceFilters>,
    chart: ChartDefinition
  ) {
    const metadata: {
      measure?: string;
      frequency?: string;
      groupBy?: string;
    } = {};

    if (dataSourceFilters.measure?.value) {
      metadata.measure = String(dataSourceFilters.measure.value);
    }
    if (dataSourceFilters.frequency?.value) {
      metadata.frequency = String(dataSourceFilters.frequency.value);
    }

    const chartConfigTyped = chart.chart_config as {
      groupBy?: string;
      series?: { groupBy?: string };
    };

    const groupBy = chartConfigTyped.groupBy || chartConfigTyped.series?.groupBy;
    if (groupBy) {
      metadata.groupBy = groupBy;
    }

    return metadata;
  }
}
