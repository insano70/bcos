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
   * Execute all charts in parallel with query deduplication and same-source batching
   *
   * OPTIMIZATION LAYERS:
   * 1. Same-source detection - identifies batching opportunities
   * 2. Parallel execution - all charts execute concurrently
   * 3. Query deduplication - reuses identical query results
   *
   * Process:
   * 1. Analyze charts for batching opportunities
   * 2. Create per-render query cache
   * 3. Execute all charts in parallel
   * 4. Aggregate statistics
   * 5. Clear cache
   *
   * @param chartConfigs - Chart execution configs
   * @returns Execution result with statistics
   */
  async executeParallel(chartConfigs: ChartExecutionConfig[]): Promise<ExecutionResult> {
    const queryCache = new DashboardQueryCache();
    const startTime = Date.now();

    try {
      // Analyze charts for batching opportunities
      const batchingOpportunities = this.analyzeBatchingOpportunities(chartConfigs);

      if (batchingOpportunities.batchableCount > 0) {
        log.info('Same-source batching opportunities detected', {
          userId: this.userContext.user_id,
          totalCharts: chartConfigs.length,
          batchableCharts: batchingOpportunities.batchableCount,
          datasourceGroups: batchingOpportunities.groupCount,
          estimatedSavings: `${Math.round(batchingOpportunities.batchableCount * 300)}ms`,
          component: 'dashboard-rendering',
        });
      }

      // Execute all charts in parallel (parallel execution provides implicit batching)
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
        batchingOpportunities: batchingOpportunities.groupCount,
        component: 'dashboard-rendering',
      });

      return { results, stats };
    } finally {
      queryCache.clear();
    }
  }

  /**
   * Analyze charts for same-source batching opportunities
   *
   * Groups charts by datasourceId to identify batching potential.
   * NOTE: Parallel execution provides implicit batching benefits.
   * Future optimization: Explicit batch queries at cache layer.
   *
   * @param chartConfigs - Chart execution configs
   * @returns Batching analysis
   */
  private analyzeBatchingOpportunities(chartConfigs: ChartExecutionConfig[]): {
    batchableCount: number;
    groupCount: number;
    groups: Map<number, ChartExecutionConfig[]>;
  } {
    const groups = new Map<number, ChartExecutionConfig[]>();

    for (const config of chartConfigs) {
      const dataSourceId = config.finalChartConfig.dataSourceId as number | undefined;
      if (typeof dataSourceId === 'number') {
        const group = groups.get(dataSourceId) || [];
        group.push(config);
        groups.set(dataSourceId, group);
      }
    }

    // Count charts in groups of 2+
    let batchableCount = 0;
    const groupArray = Array.from(groups.values());
    for (const group of groupArray) {
      if (group.length >= 2) {
        batchableCount += group.length;
      }
    }

    return {
      batchableCount,
      groupCount: groupArray.filter((g) => g.length >= 2).length,
      groups,
    };
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
