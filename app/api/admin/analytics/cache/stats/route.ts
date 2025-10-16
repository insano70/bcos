/**
 * Analytics Cache Statistics API
 *
 * GET /api/admin/analytics/cache/stats
 *
 * Returns detailed cache statistics for all analytics data sources including:
 * - Per-datasource metrics (size, age, hit rate, health)
 * - Aggregated summary statistics
 * - Cache health indicators and warnings
 *
 * RBAC: settings:read:all (Super Admin only)
 */

import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { log } from '@/lib/logger';
import { indexedAnalyticsCache } from '@/lib/cache/indexed-analytics-cache';
import { chartConfigService } from '@/lib/services/chart-config-service';
import { enrichWithHealthMetrics } from '@/lib/monitoring/analytics-cache-health';
import type { 
  AnalyticsCacheStatsResponse, 
  AnalyticsCacheSummary,
  DatasourceCacheMetrics 
} from '@/lib/monitoring/types';

const analyticsCacheStatsHandler = async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    log.info('Analytics cache stats request initiated', {
      operation: 'analytics_cache_stats',
      component: 'analytics-cache-admin',
    });

    // Get all active data sources
    const dataSources = await chartConfigService.getAllDataSources();

    if (dataSources.length === 0) {
      log.warn('No data sources found for cache stats');
      return createSuccessResponse({
        summary: createEmptySummary(),
        datasources: [],
        timestamp: new Date().toISOString(),
      });
    }

    // Fetch cache stats for all datasources in parallel
    const metricsPromises = dataSources.map(async (ds) => {
      try {
        // Get cache stats from indexed cache (now includes unique counts)
        const cacheStats = await indexedAnalyticsCache.getCacheStats(ds.id);

        // TODO: In future, fetch actual performance metrics from monitoring/analytics
        // For now, use estimated values based on cache state
        const performanceMetrics = {
          avgQueryTimeMs: cacheStats.isWarm ? 5 : 0, // Estimated 5ms for warm cache
          cacheHitRate: cacheStats.isWarm ? 100 : 0, // When warm, all queries should hit cache
          totalQueries: 0, // Will be tracked in future monitoring
        };

        // Use actual unique counts from cache stats
        const uniqueCounts = {
          measures: cacheStats.uniqueMeasures,
          practices: cacheStats.uniquePractices,
          providers: cacheStats.uniqueProviders,
          frequencies: cacheStats.uniqueFrequencies,
        };

        // Enrich with health metrics
        return enrichWithHealthMetrics(
          cacheStats,
          ds.name,
          performanceMetrics,
          uniqueCounts
        );
      } catch (error) {
        log.error('Failed to get cache stats for datasource', error instanceof Error ? error : new Error(String(error)), {
          datasourceId: ds.id,
          datasourceName: ds.name,
        });
        
        // Return minimal metrics for failed datasource
        return {
          datasourceId: ds.id,
          datasourceName: ds.name,
          isWarm: false,
          lastWarmed: null,
          ageMinutes: Infinity,
          totalEntries: 0,
          indexCount: 0,
          estimatedMemoryMB: 0,
          uniqueMeasures: 0,
          uniquePractices: 0,
          uniqueProviders: 0,
          uniqueFrequencies: [],
          avgQueryTimeMs: 0,
          cacheHitRate: 0,
          totalQueries: 0,
          health: 'cold' as const,
          healthScore: 0,
          warnings: ['Failed to retrieve cache stats'],
        } as DatasourceCacheMetrics;
      }
    });

    const datasourceMetrics = await Promise.all(metricsPromises);

    // Calculate aggregated summary
    const summary = calculateSummary(datasourceMetrics);

    const response: AnalyticsCacheStatsResponse = {
      summary,
      datasources: datasourceMetrics,
      timestamp: new Date().toISOString(),
    };

    const duration = Date.now() - startTime;

    log.info('Analytics cache stats retrieved', {
      operation: 'analytics_cache_stats',
      duration,
      datasourcesTotal: dataSources.length,
      datasourcesWarm: summary.warmDatasources,
      totalMemoryMB: summary.totalMemoryMB,
      overallHitRate: summary.overallCacheHitRate,
      component: 'analytics-cache-admin',
    });

    return createSuccessResponse(response);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error(
      'Failed to get analytics cache stats',
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: 'analytics_cache_stats',
        duration,
        component: 'analytics-cache-admin',
      }
    );

    return createErrorResponse(
      error instanceof Error ? error : new Error(String(error)),
      500,
      request
    );
  }
};

/**
 * Calculate aggregated summary from datasource metrics
 */
function calculateSummary(datasources: DatasourceCacheMetrics[]): AnalyticsCacheSummary {
  const totalDatasources = datasources.length;
  const warmDatasources = datasources.filter(ds => ds.isWarm).length;
  const coldDatasources = totalDatasources - warmDatasources;

  const totalCacheEntries = datasources.reduce((sum, ds) => sum + ds.totalEntries, 0);
  const totalIndexes = datasources.reduce((sum, ds) => sum + ds.indexCount, 0);
  const totalMemoryMB = Math.round(
    datasources.reduce((sum, ds) => sum + ds.estimatedMemoryMB, 0) * 100
  ) / 100;

  // Calculate average hit rate (weighted by total queries)
  const totalQueries = datasources.reduce((sum, ds) => sum + ds.totalQueries, 0);
  const weightedHitRate = totalQueries > 0
    ? datasources.reduce((sum, ds) => sum + (ds.cacheHitRate * ds.totalQueries), 0) / totalQueries
    : 0;

  // Calculate average cache age (only for warm caches)
  const warmDatasources_filtered = datasources.filter(ds => ds.isWarm && ds.ageMinutes !== Infinity);
  const avgCacheAge = warmDatasources_filtered.length > 0
    ? Math.round(
        warmDatasources_filtered.reduce((sum, ds) => sum + ds.ageMinutes, 0) / warmDatasources_filtered.length
      )
    : 0;

  // Find oldest cache
  const oldestCacheDs = warmDatasources_filtered.reduce<DatasourceCacheMetrics | null>(
    (oldest, ds) => {
      if (!oldest || ds.ageMinutes > oldest.ageMinutes) {
        return ds;
      }
      return oldest;
    },
    null
  );

  // Count health distribution
  const healthDistribution = datasources.reduce(
    (acc, ds) => {
      acc[ds.health]++;
      return acc;
    },
    { excellent: 0, good: 0, degraded: 0, stale: 0, cold: 0 }
  );

  return {
    totalDatasources,
    warmDatasources,
    coldDatasources,
    totalCacheEntries,
    totalIndexes,
    totalMemoryMB,
    overallCacheHitRate: Math.round(weightedHitRate * 100) / 100,
    avgCacheAge,
    oldestCache: oldestCacheDs?.datasourceId || null,
    healthDistribution,
  };
}

/**
 * Create empty summary for when no datasources exist
 */
function createEmptySummary(): AnalyticsCacheSummary {
  return {
    totalDatasources: 0,
    warmDatasources: 0,
    coldDatasources: 0,
    totalCacheEntries: 0,
    totalIndexes: 0,
    totalMemoryMB: 0,
    overallCacheHitRate: 0,
    avgCacheAge: 0,
    oldestCache: null,
    healthDistribution: {
      excellent: 0,
      good: 0,
      degraded: 0,
      stale: 0,
      cold: 0,
    },
  };
}

// Export with RBAC protection - only super admins can view cache stats
export const GET = rbacRoute(analyticsCacheStatsHandler, {
  permission: 'settings:read:all',
  rateLimit: 'api',
});

