/**
 * Chart Config Builder Service (Refactored)
 *
 * Slim orchestrator that coordinates specialized services:
 * - chartExecutionConfigCache: Redis-backed cache (singleton)
 * - ChartConfigValidator: Validation
 * - ChartFilterBuilder: Filter extraction and building
 * - ChartConfigNormalizer: Config normalization
 *
 * Single Responsibility: Orchestration only
 *
 * Benefits of refactoring:
 * - Single Responsibility Principle (each service has one job)
 * - Testability (each service can be tested independently)
 * - Maintainability (100-150 line files vs 637 line god file)
 * - Reusability (services can be used independently)
 * - Clarity (clear separation of concerns)
 */

import { log } from '@/lib/logger';
import type { ChartDefinition, ChartExecutionConfig, ResolvedFilters } from './types';
import { chartExecutionConfigCache } from './chart-config-cache';
import { ChartConfigValidator } from './chart-config-validator';
import { ChartFilterBuilder } from './chart-filter-builder';
import { ChartConfigNormalizer } from './chart-config-normalizer';

// Re-export ConfigValidationResult for backward compatibility
export type { ConfigValidationResult } from './chart-config-validator';

/**
 * Chart Config Builder Service
 *
 * Orchestrates chart config building by delegating to specialized services.
 * Uses Redis-backed singleton cache for cross-request caching.
 */
export class ChartConfigBuilderService {
  private validator: ChartConfigValidator;
  private filterBuilder: ChartFilterBuilder;
  private normalizer: ChartConfigNormalizer;

  constructor() {
    this.validator = new ChartConfigValidator();
    this.filterBuilder = new ChartFilterBuilder();
    this.normalizer = new ChartConfigNormalizer();
  }

  /**
   * Build execution configs for all charts
   *
   * @param charts - Chart definitions
   * @param universalFilters - Dashboard-level filters
   * @returns Array of chart execution configs
   */
  async buildChartConfigs(
    charts: ChartDefinition[],
    universalFilters: ResolvedFilters
  ): Promise<ChartExecutionConfig[]> {
    // Build configs in parallel for better performance
    return Promise.all(
      charts.map((chart) => this.buildSingleChartConfig(chart, universalFilters))
    );
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
  async buildSingleChartConfig(
    chart: ChartDefinition,
    universalFilters: ResolvedFilters
  ): Promise<ChartExecutionConfig> {
    // 1. Check cache (Redis-backed, persists across requests)
    const cacheKey = chartExecutionConfigCache.buildCacheKey(
      chart.chart_definition_id,
      universalFilters
    );
    const cached = await chartExecutionConfigCache.getConfig(cacheKey);

    if (cached) {
      return cached;
    }

    // 2. Validate chart definition
    const validation = this.validator.validate(chart, universalFilters);
    if (!validation.isValid) {
      throw new Error(
        `Chart config validation failed: ${validation.errors.join(', ')}`
      );
    }

    // 3. Extract filters from data source
    const extractedFilters = this.filterBuilder.extractDataSourceFilters(chart);

    // 4. Build runtime filters
    const chartConfig = chart.chart_config as { frequency?: string } | undefined;
    const runtimeFilters = this.filterBuilder.buildRuntimeFilters(
      extractedFilters,
      universalFilters,
      chartConfig
    );

    // 5. Normalize chart config
    const normalizedConfig = this.normalizer.normalize(chart, universalFilters);

    // 6. Extract metadata
    const metadata = this.filterBuilder.extractMetadata(extractedFilters, chart);

    // 7. Build config
    const config: ChartExecutionConfig = {
      chartId: chart.chart_definition_id,
      chartName: chart.chart_name,
      chartType: chart.chart_type,
      finalChartConfig: normalizedConfig,
      runtimeFilters,
      metadata,
    };

    // 8. Cache (fire and forget - don't block on cache write)
    chartExecutionConfigCache.setConfig(cacheKey, config).catch(() => {
      // Ignore cache write errors - database is source of truth
    });

    log.debug('Chart config built and validated', {
      chartId: chart.chart_definition_id,
      chartName: chart.chart_name,
      chartType: chart.chart_type,
      hasGroupBy: Boolean(normalizedConfig.groupBy),
      groupByValue: normalizedConfig.groupBy,
      runtimeFilterKeys: Object.keys(runtimeFilters),
      validated: true,
      component: 'chart-config-builder',
    });

    return config;
  }

  /**
   * Invalidate config cache
   *
   * Call when chart definitions change to ensure fresh configs.
   *
   * @param chartId - Optional: specific chart ID to invalidate
   */
  async invalidateCache(chartId?: string): Promise<void> {
    await chartExecutionConfigCache.invalidate(chartId);
  }
}
