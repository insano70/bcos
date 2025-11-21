/**
 * Chart Config Builder Service (Refactored)
 *
 * Slim orchestrator that coordinates specialized services:
 * - ChartConfigCacheService: Cache management
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
import { ChartConfigCacheService } from './chart-config-cache';
import { ChartConfigValidator } from './chart-config-validator';
import { ChartFilterBuilder } from './chart-filter-builder';
import { ChartConfigNormalizer } from './chart-config-normalizer';

// Re-export ConfigValidationResult for backward compatibility
export type { ConfigValidationResult } from './chart-config-validator';

/**
 * Chart Config Builder Service
 *
 * Orchestrates chart config building by delegating to specialized services.
 * Maintains same public API for backward compatibility.
 */
export class ChartConfigBuilderService {
  private cache: ChartConfigCacheService;
  private validator: ChartConfigValidator;
  private filterBuilder: ChartFilterBuilder;
  private normalizer: ChartConfigNormalizer;

  constructor() {
    this.cache = new ChartConfigCacheService();
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
  buildChartConfigs(
    charts: ChartDefinition[],
    universalFilters: ResolvedFilters
  ): ChartExecutionConfig[] {
    return charts.map((chart) =>
      this.buildSingleChartConfig(chart, universalFilters)
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
  buildSingleChartConfig(
    chart: ChartDefinition,
    universalFilters: ResolvedFilters
  ): ChartExecutionConfig {
    // 1. Check cache
    const cacheKey = this.cache.buildCacheKey(
      chart.chart_definition_id,
      universalFilters
    );
    const cached = this.cache.get(cacheKey);

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

    // 8. Cache and return
    this.cache.set(cacheKey, config);

    log.debug('Chart config built, validated, and cached', {
      chartId: chart.chart_definition_id,
      chartName: chart.chart_name,
      chartType: chart.chart_type,
      hasGroupBy: Boolean(normalizedConfig.groupBy),
      groupByValue: normalizedConfig.groupBy,
      runtimeFilterKeys: Object.keys(runtimeFilters),
      validated: true,
      cached: true,
      cacheStats: this.cache.getStats(),
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
  invalidateCache(chartId?: string): void {
    this.cache.invalidate(chartId);
  }

  /**
   * Get cache statistics
   *
   * For monitoring and debugging.
   */
  getCacheStats() {
    return this.cache.getStats();
  }
}
