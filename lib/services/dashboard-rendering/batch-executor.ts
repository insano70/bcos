/**
 * Batch Executor Service
 *
 * Responsible for parallel chart execution.
 *
 * Single Responsibility:
 * - Execute all charts in parallel
 * - Result aggregation
 * - Statistics collection
 * - Error handling (partial success)
 *
 * PERFORMANCE OPTIMIZATION:
 * Uses request-scoped cache to deduplicate data source fetches.
 * When multiple charts request the same (measure + frequency), only one
 * Redis fetch occurs - subsequent requests use in-memory cache.
 */

import { log } from '@/lib/logger';
import { createRequestScopedCache, type RequestScopedCache } from '@/lib/cache/request-scoped-cache';
import { chartDataOrchestrator } from '@/lib/services/chart-data-orchestrator';
import { BaseDashboardRenderingService } from './base-service';
import type { ChartExecutionConfig, ChartRenderResult, ExecutionResult } from './types';

/**
 * Batch Executor Service
 *
 * Executes all charts in parallel.
 */
export class BatchExecutorService extends BaseDashboardRenderingService {
  /**
   * Execute all charts in parallel
   *
   * Process:
   * 1. Create request-scoped cache for deduplication
   * 2. Analyze charts for batching opportunities
   * 3. Execute all charts in parallel
   * 4. Aggregate statistics
   *
   * @param chartConfigs - Chart execution configs
   * @returns Execution result with statistics
   */
  async executeParallel(chartConfigs: ChartExecutionConfig[]): Promise<ExecutionResult> {
    const startTime = Date.now();

    // Create request-scoped cache for data source deduplication
    // This cache lives for the duration of this dashboard render only
    const requestCache = createRequestScopedCache();

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

    // Execute all charts in parallel, sharing the request-scoped cache
    const renderPromises = chartConfigs.map((config) =>
      this.executeSingleChart(config, requestCache, startTime)
    );

    const resultsWithTiming = await Promise.all(renderPromises);

    // Log request-scoped cache statistics
    requestCache.logFinalStats();

    // Extract results without timing for return value
    const results = resultsWithTiming.map(({ chartId, result }) => ({ chartId, result }));

    // Aggregate statistics
    const stats = this.aggregateStats(results);

    const duration = Date.now() - startTime;

    // Analyze parallel execution effectiveness
    const timings = resultsWithTiming.map(r => r.timing);
    const parallelAnalysis = this.analyzeParallelExecution(timings, duration);

    log.info('Batch execution completed', {
      userId: this.userContext.user_id,
      chartsRendered: results.filter((r) => r.result !== null).length,
      totalCharts: chartConfigs.length,
      cacheHits: stats.cacheHits,
      cacheMisses: stats.cacheMisses,
      totalQueryTime: stats.totalQueryTime,
      parallelDuration: duration,
      batchingOpportunities: batchingOpportunities.groupCount,
      requestCacheStats: requestCache.getStats(),
      parallelExecution: parallelAnalysis,
      component: 'dashboard-rendering',
    });

    return { results, stats };
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
   * Execute single chart
   *
   * @param config - Chart execution config
   * @param requestCache - Request-scoped cache for data deduplication
   * @param batchStartTime - Start time of the batch (for parallel timing analysis)
   * @returns Chart ID and result (or null on error)
   */
  private async executeSingleChart(
    config: ChartExecutionConfig,
    requestCache: RequestScopedCache,
    batchStartTime: number
  ): Promise<{ chartId: string; result: ChartRenderResult | null; timing: { startOffset: number; duration: number } }> {
    const chartStartTime = Date.now();
    const startOffset = chartStartTime - batchStartTime;
    
    try {
      log.debug('Chart execution starting', {
        userId: this.userContext.user_id,
        chartId: config.chartId,
        chartName: config.chartName,
        chartType: config.chartType,
        startOffset,
        component: 'dashboard-rendering',
      });

      // Execute orchestration with request-scoped cache for deduplication
      const orchestrationResult = await chartDataOrchestrator.orchestrate(
        {
          chartConfig: config.finalChartConfig as typeof config.finalChartConfig & {
            chartType: string;
            dataSourceId: number;
          },
          runtimeFilters: config.runtimeFilters,
        },
        this.userContext,
        requestCache
      );

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
        // CRITICAL: Include the config and filters used to render
        // This allows dimension expansion to just reuse them (no reconstruction!)
        finalChartConfig: config.finalChartConfig,
        runtimeFilters: config.runtimeFilters,
      };

      // Include columns/formattedData if present (table charts)
      if (orchestrationResult.columns) {
        chartResult.columns = orchestrationResult.columns;
      }
      if (orchestrationResult.formattedData) {
        chartResult.formattedData = orchestrationResult.formattedData;
      }

      const duration = Date.now() - chartStartTime;
      
      log.debug('Chart execution completed', {
        userId: this.userContext.user_id,
        chartId: config.chartId,
        chartName: config.chartName,
        duration,
        startOffset,
        cacheHit: orchestrationResult.metadata.cacheHit,
        component: 'dashboard-rendering',
      });

      return {
        chartId: config.chartId,
        result: chartResult,
        timing: { startOffset, duration },
      };
    } catch (error) {
      const duration = Date.now() - chartStartTime;
      
      log.error('Chart render failed in batch', error, {
        userId: this.userContext.user_id,
        chartId: config.chartId,
        chartName: config.chartName,
        duration,
        startOffset,
        component: 'dashboard-rendering',
      });

      // Return null for failed charts (partial success)
      return {
        chartId: config.chartId,
        result: null,
        timing: { startOffset, duration },
      };
    }
  }

  /**
   * Aggregate statistics from execution results
   *
   * @param results - Chart execution results
   * @returns Aggregated statistics
   */
  private aggregateStats(
    results: Array<{ chartId: string; result: ChartRenderResult | null }>
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

    return {
      cacheHits,
      cacheMisses,
      totalQueryTime,
    };
  }

  /**
   * Analyze parallel execution effectiveness
   *
   * Computes metrics to verify charts are truly executing in parallel:
   * - Sequential time: Sum of all chart durations (if run sequentially)
   * - Parallel time: Actual wall-clock time
   * - Speedup factor: Sequential / Parallel (higher = more parallelism)
   * - Overlap percentage: How much charts overlapped in time
   *
   * @param timings - Array of chart timing data
   * @param totalDuration - Total batch execution time
   * @returns Parallel execution analysis
   */
  private analyzeParallelExecution(
    timings: Array<{ startOffset: number; duration: number }>,
    totalDuration: number
  ): {
    sequentialTime: number;
    parallelTime: number;
    speedupFactor: number;
    overlapPercent: number;
    chartsExecuted: number;
  } {
    if (timings.length === 0) {
      return {
        sequentialTime: 0,
        parallelTime: totalDuration,
        speedupFactor: 1,
        overlapPercent: 0,
        chartsExecuted: 0,
      };
    }

    // Calculate sequential time (sum of all durations)
    const sequentialTime = timings.reduce((sum, t) => sum + t.duration, 0);

    // Calculate overlap percentage
    // If charts run truly in parallel, overlap should be high
    // If sequential, overlap would be 0%
    const parallelTime = totalDuration;
    const speedupFactor = sequentialTime > 0 ? sequentialTime / parallelTime : 1;
    
    // Overlap = (sequential - parallel) / sequential * 100
    // 0% = no overlap (sequential), 100% = perfect overlap (all started at once)
    const overlapPercent = sequentialTime > 0 
      ? Math.max(0, ((sequentialTime - parallelTime) / sequentialTime) * 100)
      : 0;

    return {
      sequentialTime,
      parallelTime,
      speedupFactor: Math.round(speedupFactor * 100) / 100,
      overlapPercent: Math.round(overlapPercent * 10) / 10,
      chartsExecuted: timings.length,
    };
  }
}
