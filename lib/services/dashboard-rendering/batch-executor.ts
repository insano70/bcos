/**
 * Batch Executor Service
 *
 * Responsible for parallel chart execution with query deduplication.
 *
 * Single Responsibility:
 * - Execute all charts in parallel
 * - Query hash generation
 * - Deduplication via DashboardQueryCache
 * - Result aggregation
 * - Statistics collection
 * - Error handling (partial success)
 */

import { log } from '@/lib/logger';
import { chartDataOrchestrator } from '@/lib/services/chart-data-orchestrator';
import { DashboardQueryCache, generateQueryHash } from '@/lib/services/dashboard-query-cache';
import { BaseDashboardRenderingService } from './base-service';
import type { ChartExecutionConfig, ChartRenderResult, ExecutionResult } from './types';

/**
 * Batch Executor Service
 *
 * Executes all charts in parallel with query deduplication.
 */
export class BatchExecutorService extends BaseDashboardRenderingService {
  /**
   * Execute all charts in parallel with query deduplication
   *
   * Process:
   * 1. Create per-render query cache
   * 2. Execute all charts in parallel
   * 3. Aggregate statistics
   * 4. Clear cache
   *
   * @param chartConfigs - Chart execution configs
   * @returns Execution result with statistics
   */
  async executeParallel(chartConfigs: ChartExecutionConfig[]): Promise<ExecutionResult> {
    const queryCache = new DashboardQueryCache();
    const startTime = Date.now();

    try {
      // Execute all charts in parallel
      const renderPromises = chartConfigs.map((config) =>
        this.executeSingleChart(config, queryCache)
      );

      const results = await Promise.all(renderPromises);

      // Aggregate statistics
      const stats = this.aggregateStats(results, queryCache);

      const duration = Date.now() - startTime;

      log.info('Batch execution completed', {
        userId: this.userContext.user_id,
        chartsRendered: results.filter((r) => r.result !== null).length,
        totalCharts: chartConfigs.length,
        cacheHits: stats.cacheHits,
        cacheMisses: stats.cacheMisses,
        totalQueryTime: stats.totalQueryTime,
        parallelDuration: duration,
        deduplication: {
          uniqueQueries: stats.deduplicationStats.uniqueQueries,
          queriesDeduped: stats.deduplicationStats.queriesDeduped,
          deduplicationRate: `${stats.deduplicationStats.deduplicationRate}%`,
        },
        component: 'dashboard-rendering',
      });

      return { results, stats };
    } finally {
      queryCache.clear();
    }
  }

  /**
   * Execute single chart with deduplication
   *
   * @param config - Chart execution config
   * @param queryCache - Per-render query cache
   * @returns Chart ID and result (or null on error)
   */
  private async executeSingleChart(
    config: ChartExecutionConfig,
    queryCache: DashboardQueryCache
  ): Promise<{ chartId: string; result: ChartRenderResult | null }> {
    try {
      log.info('Processing chart in batch', {
        userId: this.userContext.user_id,
        chartId: config.chartId,
        chartName: config.chartName,
        chartType: config.chartType,
        batchSupported: true,
        component: 'dashboard-rendering',
      });

      // Generate query hash for deduplication
      const queryHash = generateQueryHash(config.finalChartConfig, config.runtimeFilters);

      // Execute with deduplication
      const orchestrationResult = await queryCache.get(queryHash, async () => {
        return await chartDataOrchestrator.orchestrate(
          {
            chartConfig: config.finalChartConfig as typeof config.finalChartConfig & {
              chartType: string;
              dataSourceId: number;
            },
            runtimeFilters: config.runtimeFilters,
          },
          this.userContext
        );
      });

      // Build chart result
      const chartResult: ChartRenderResult = {
        chartData: orchestrationResult.chartData,
        rawData: orchestrationResult.rawData,
        metadata: {
          chartType: orchestrationResult.metadata.chartType,
          dataSourceId: orchestrationResult.metadata.dataSourceId,
          transformedAt: new Date().toISOString(),
          queryTimeMs: orchestrationResult.metadata.queryTimeMs,
          cacheHit: orchestrationResult.metadata.cacheHit,
          recordCount: orchestrationResult.metadata.recordCount,
          transformDuration: 0,
          // Add optional metadata fields
          ...(config.metadata.measure && { measure: config.metadata.measure }),
          ...(config.metadata.frequency && { frequency: config.metadata.frequency }),
          ...(config.metadata.groupBy && { groupBy: config.metadata.groupBy }),
        },
      };

      // Include columns/formattedData if present (table charts)
      if (orchestrationResult.columns) {
        chartResult.columns = orchestrationResult.columns;
      }
      if (orchestrationResult.formattedData) {
        chartResult.formattedData = orchestrationResult.formattedData;
      }

      return {
        chartId: config.chartId,
        result: chartResult,
      };
    } catch (error) {
      log.error('Chart render failed in batch', error, {
        userId: this.userContext.user_id,
        chartId: config.chartId,
        chartName: config.chartName,
        component: 'dashboard-rendering',
      });

      // Return null for failed charts (partial success)
      return {
        chartId: config.chartId,
        result: null,
      };
    }
  }

  /**
   * Aggregate statistics from execution results
   *
   * @param results - Chart execution results
   * @param queryCache - Query cache with deduplication stats
   * @returns Aggregated statistics
   */
  private aggregateStats(
    results: Array<{ chartId: string; result: ChartRenderResult | null }>,
    queryCache: DashboardQueryCache
  ) {
    let cacheHits = 0;
    let cacheMisses = 0;
    let totalQueryTime = 0;

    for (const { result } of results) {
      if (result) {
        if (result.metadata.cacheHit) {
          cacheHits++;
        } else {
          cacheMisses++;
        }
        totalQueryTime += result.metadata.queryTimeMs;
      }
    }

    const dedupStats = queryCache.getStats();

    return {
      cacheHits,
      cacheMisses,
      totalQueryTime,
      deduplicationStats: {
        uniqueQueries: dedupStats.uniqueQueries,
        queriesDeduped: dedupStats.hits,
        deduplicationRate: dedupStats.deduplicationRate,
      },
    };
  }
}
