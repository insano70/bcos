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
import { createHash } from 'node:crypto';
import { configTemplatesRegistry } from './config-templates';

/**
 * Data source filter (from chart definition)
 */
interface DataSourceFilter {
  field: string;
  operator?: string;
  value?: unknown;
}

/**
 * Validation result for chart config
 */
export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Chart types that require measure-based data
 */
const MEASURE_BASED_CHART_TYPES = [
  'line',
  'bar',
  'stacked-bar',
  'horizontal-bar',
  'area',
  'pie',
  'doughnut',
  'dual-axis',
  'number',
  'progress-bar',
] as const;

/**
 * Valid chart types
 */
const VALID_CHART_TYPES = [
  ...MEASURE_BASED_CHART_TYPES,
  'table', // table-based
] as const;

/**
 * Chart Config Builder Service
 *
 * Builds execution configs for charts by:
 * - Extracting filters from data_source
 * - Building runtime filters
 * - Normalizing chart config
 * - Caching built configs (Phase 1 enhancement)
 */
export class ChartConfigBuilderService {
  /**
   * Config cache (Phase 1 enhancement)
   * Maps cache key → built config
   * Cleared when chart definitions change
   */
  private configCache = new Map<string, ChartExecutionConfig>();

  /**
   * Cache statistics for monitoring
   */
  private cacheStats = {
    hits: 0,
    misses: 0,
    size: 0,
  };
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
   * Used by both dashboard rendering and dimension expansion systems.
   *
   * @param chart - Chart definition
   * @param universalFilters - Dashboard-level filters
   * @returns Chart execution config
   */
  buildSingleChartConfig(
    chart: ChartDefinition,
    universalFilters: ResolvedFilters
  ): ChartExecutionConfig {
    // Phase 1 Enhancement: Check cache first
    const cacheKey = this.buildCacheKey(chart.chart_definition_id, universalFilters);
    const cached = this.configCache.get(cacheKey);

    if (cached) {
      this.cacheStats.hits++;
      log.debug('Chart config served from cache', {
        chartId: chart.chart_definition_id,
        cacheHit: true,
        cacheStats: this.cacheStats,
        component: 'dashboard-rendering',
      });
      return cached;
    }

    this.cacheStats.misses++;

    // 1. Validate chart definition (Phase 1 enhancement)
    const validation = this.validateChartDefinition(chart, universalFilters);
    if (!validation.isValid) {
      log.error('Chart config validation failed', new Error(validation.errors.join(', ')), {
        chartId: chart.chart_definition_id,
        chartName: chart.chart_name,
        errors: validation.errors,
        warnings: validation.warnings,
        component: 'dashboard-rendering',
      });
      throw new Error(`Chart config validation failed: ${validation.errors.join(', ')}`);
    }

    // Log warnings (non-fatal issues)
    if (validation.warnings.length > 0) {
      log.warn('Chart config validation warnings', {
        chartId: chart.chart_definition_id,
        chartName: chart.chart_name,
        warnings: validation.warnings,
        component: 'dashboard-rendering',
      });
    }

    // 2. Extract filters from data_source
    const dataSourceFilters = this.extractDataSourceFilters(chart);

    // 3. Extract chart config for frequency fallback
    const chartConfig = chart.chart_config as { frequency?: string } | undefined;

    // 4. Build runtime filters
    const runtimeFilters = this.buildRuntimeFilters(dataSourceFilters, universalFilters, chartConfig);

    // 5. Normalize chart config
    const normalizedConfig = this.normalizeChartConfig(chart, universalFilters);

    // 6. Build metadata
    const metadata = this.extractMetadata(dataSourceFilters, chart);

    const config: ChartExecutionConfig = {
      chartId: chart.chart_definition_id,
      chartName: chart.chart_name,
      chartType: chart.chart_type,
      finalChartConfig: normalizedConfig,
      runtimeFilters,
      metadata,
    };

    // Phase 1 Enhancement: Cache the built config
    this.configCache.set(cacheKey, config);
    this.cacheStats.size = this.configCache.size;

    log.debug('Chart config built, validated, and cached', {
      chartId: chart.chart_definition_id,
      chartName: chart.chart_name,
      chartType: chart.chart_type,
      hasGroupBy: Boolean(normalizedConfig.groupBy),
      groupByValue: normalizedConfig.groupBy,
      runtimeFilterKeys: Object.keys(runtimeFilters),
      validated: true,
      cached: true,
      cacheStats: this.cacheStats,
      component: 'dashboard-rendering',
    });

    return config;
  }

  /**
   * Build cache key for config caching
   * 
   * Phase 1 Enhancement: Cache key based on chart ID + filters
   * 
   * @param chartId - Chart definition ID
   * @param filters - Resolved filters
   * @returns Cache key
   */
  private buildCacheKey(chartId: string, filters: ResolvedFilters): string {
    // Include filter properties that affect config building
    const filterComponents = {
      startDate: filters.startDate,
      endDate: filters.endDate,
      dateRangePreset: filters.dateRangePreset,
      organizationId: filters.organizationId,
      practiceUids: filters.practiceUids?.sort(), // Sort for consistency
      providerName: filters.providerName,
    };

    const filterHash = createHash('md5')
      .update(JSON.stringify(filterComponents))
      .digest('hex')
      .substring(0, 16);

    return `config:${chartId}:${filterHash}`;
  }

  /**
   * Invalidate config cache
   * 
   * Call when chart definitions change to ensure fresh configs.
   * 
   * @param chartId - Optional: specific chart ID to invalidate
   */
  invalidateCache(chartId?: string): void {
    if (chartId) {
      // Invalidate specific chart (all filter combinations)
      const allKeys = Array.from(this.configCache.keys());
      const keysToDelete = allKeys.filter((key) => key.startsWith(`config:${chartId}:`));
      
      for (const key of keysToDelete) {
        this.configCache.delete(key);
      }

      this.cacheStats.size = this.configCache.size;

      log.info('Chart config cache invalidated', {
        chartId,
        keysDeleted: keysToDelete.length,
        component: 'dashboard-rendering',
      });
    } else {
      // Clear entire cache
      const previousSize = this.configCache.size;
      this.configCache.clear();
      this.cacheStats = { hits: 0, misses: 0, size: 0 };

      log.info('Chart config cache cleared', {
        previousSize,
        component: 'dashboard-rendering',
      });
    }
  }

  /**
   * Get cache statistics
   * 
   * For monitoring and debugging.
   */
  getCacheStats() {
    const hitRate = this.cacheStats.hits + this.cacheStats.misses > 0
      ? (this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses)) * 100
      : 0;

    return {
      ...this.cacheStats,
      hitRate: `${hitRate.toFixed(1)}%`,
    };
  }

  /**
   * Validate chart definition before building config
   *
   * Phase 1 Enhancement: Catch configuration errors early
   * Uses template registry to validate required fields.
   *
   * @param chart - Chart definition to validate
   * @param universalFilters - Universal filters for context
   * @returns Validation result with errors and warnings
   */
  private validateChartDefinition(
    chart: ChartDefinition,
    universalFilters: ResolvedFilters
  ): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Validate basic structure
    if (!chart.chart_definition_id) {
      errors.push('Missing chart_definition_id');
    }

    if (!chart.chart_name) {
      errors.push('Missing chart_name');
    }

    if (!chart.chart_type) {
      errors.push('Missing chart_type');
    } else if (!VALID_CHART_TYPES.includes(chart.chart_type as typeof VALID_CHART_TYPES[number])) {
      errors.push(`Invalid chart_type: ${chart.chart_type}`);
    }

    // 2. Validate data source configuration
    const chartConfigTyped = chart.chart_config as { dataSourceId?: number };
    const dataSourceId = chartConfigTyped?.dataSourceId;

    if (!dataSourceId) {
      errors.push('Missing dataSourceId in chart_config');
    } else if (dataSourceId <= 0) {
      errors.push(`Invalid dataSourceId: ${dataSourceId} (must be positive)`);
    }

    // Phase 1 Enhancement: Validate against template requirements
    if (chart.chart_type) {
      const templateValidation = configTemplatesRegistry.validateAgainstTemplate(
        chart.chart_type,
        chartConfigTyped || {}
      );

      if (!templateValidation.isValid) {
        for (const field of templateValidation.missingFields) {
          warnings.push(`Missing recommended field for ${chart.chart_type}: ${field}`);
        }
      }
    }

    // 3. Validate measure-based chart requirements
    if (MEASURE_BASED_CHART_TYPES.includes(chart.chart_type as typeof MEASURE_BASED_CHART_TYPES[number])) {
      const dataSource = chart.data_source as { filters?: DataSourceFilter[] };
      const filters = dataSource?.filters || [];
      
      // Check for frequency (required for measure-based charts)
      const hasFrequency = 
        filters.some((f) => f.field === 'frequency' && f.value) ||
        (chartConfigTyped as { frequency?: string })?.frequency;

      if (!hasFrequency && chart.chart_type !== 'dual-axis') {
        warnings.push('Measure-based chart missing frequency filter (will use default)');
      }

      // Dual-axis charts require dualAxisConfig
      if (chart.chart_type === 'dual-axis') {
        const dualAxisConfig = (chartConfigTyped as { dualAxisConfig?: unknown })?.dualAxisConfig;
        if (!dualAxisConfig) {
          errors.push('Dual-axis chart missing dualAxisConfig');
        }
      }

      // Progress bar charts require aggregation
      if (chart.chart_type === 'progress-bar') {
        const aggregation = (chartConfigTyped as { aggregation?: string })?.aggregation;
        if (!aggregation) {
          warnings.push('Progress bar chart missing aggregation (will use default)');
        }
      }
    }

    // 4. Validate date range consistency
    const startDate = universalFilters.startDate;
    const endDate = universalFilters.endDate;

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (start > end) {
        errors.push(`Invalid date range: startDate (${startDate}) is after endDate (${endDate})`);
      }
    }

    // 5. Validate practice UIDs
    if (universalFilters.practiceUids && Array.isArray(universalFilters.practiceUids)) {
      if (universalFilters.practiceUids.length === 0) {
        warnings.push('Empty practiceUids array may result in no data');
      }

      // Check for invalid practice UIDs
      const invalidPractices = universalFilters.practiceUids.filter((p) => typeof p !== 'number' || p <= 0);
      if (invalidPractices.length > 0) {
        errors.push(`Invalid practice UIDs: ${invalidPractices.join(', ')}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
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
      // Convert single practice to array for consistency
      runtimeFilters.practiceUids = [dataSourceFilters.practice.value];
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

    // Phase 1 Enhancement: Apply template defaults first, then override with chart config
    const baseConfig: Record<string, unknown> = {
      chartType: chart.chart_type,
      dataSourceId: chartConfigTyped.dataSourceId || 0,
    };

    // Apply chart-type-specific template defaults
    const configWithDefaults = configTemplatesRegistry.applyTemplate(chart.chart_type, baseConfig);

    // Merge with actual chart config (chart config takes precedence)
    const config: Record<string, unknown> = {
      ...configWithDefaults,
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
