/**
 * Analytics Cache Warming API
 *
 * POST /api/admin/analytics/cache/warm
 *
 * Triggers cache warming for analytics data sources:
 * - Single datasource warming
 * - Bulk "warm all" operation
 * - Returns job ID for tracking
 *
 * RBAC: settings:write:all (Super Admin only)
 */

import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { log } from '@/lib/logger';
import { indexedAnalyticsCache } from '@/lib/cache/indexed-analytics-cache';
import { chartConfigService } from '@/lib/services/chart-config-service';
import { cacheWarmingTracker } from '@/lib/monitoring/cache-warming-tracker';

interface WarmCacheRequest {
  datasourceId?: number; // Omit to warm all datasources
  force?: boolean;       // Force rewarm even if recently warmed
}

interface WarmCacheResponse {
  jobId?: string;
  jobIds?: string[];
  datasourcesQueued: number[];
  estimatedDuration: number;
  message: string;
}

const warmCacheHandler = async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    const body = await request.json() as WarmCacheRequest;
    const { datasourceId, force = false } = body;

    log.info('Cache warming request initiated', {
      operation: 'cache_warm',
      datasourceId,
      force,
      component: 'analytics-cache-admin',
    });

    // Single datasource warming
    if (datasourceId !== undefined) {
      // Check if already warming
      if (cacheWarmingTracker.isWarming(datasourceId)) {
        return createErrorResponse(
          new Error('Cache warming already in progress for this datasource'),
          409,
          request
        );
      }

      // Get datasource info
      const datasource = await chartConfigService.getDataSourceConfigById(datasourceId);
      if (!datasource) {
        return createErrorResponse(
          new Error(`Data source ${datasourceId} not found`),
          404,
          request
        );
      }

      // Create job
      const job = cacheWarmingTracker.createJob(datasourceId, datasource.name);

      // Start warming in background (don't await)
      warmDatasourceBackground(job.jobId, datasourceId).catch(error => {
        log.error('Background cache warming failed', error instanceof Error ? error : new Error(String(error)), {
          jobId: job.jobId,
          datasourceId,
        });
      });

      const response: WarmCacheResponse = {
        jobId: job.jobId,
        datasourcesQueued: [datasourceId],
        estimatedDuration: 120, // Estimated 2 minutes
        message: `Cache warming started for datasource ${datasourceId}`,
      };

      log.info('Cache warming job created', {
        operation: 'cache_warm',
        jobId: job.jobId,
        datasourceId,
        duration: Date.now() - startTime,
        component: 'analytics-cache-admin',
      });

      return createSuccessResponse(response);
    }

    // Bulk warming (all datasources)
    const dataSources = await chartConfigService.getAllDataSources();

    if (dataSources.length === 0) {
      return createSuccessResponse({
        jobIds: [],
        datasourcesQueued: [],
        estimatedDuration: 0,
        message: 'No data sources found to warm',
      });
    }

    // Create jobs for all datasources (excluding those already warming)
    const jobIds: string[] = [];
    const datasourcesQueued: number[] = [];

    for (const ds of dataSources) {
      // Skip if already warming
      if (!force && cacheWarmingTracker.isWarming(ds.id)) {
        log.info('Skipping datasource - already warming', {
          datasourceId: ds.id,
          datasourceName: ds.name,
        });
        continue;
      }

      const job = cacheWarmingTracker.createJob(ds.id, ds.name);
      jobIds.push(job.jobId);
      datasourcesQueued.push(ds.id);

      // Start warming in background (don't await)
      warmDatasourceBackground(job.jobId, ds.id).catch(error => {
        log.error('Background cache warming failed', error instanceof Error ? error : new Error(String(error)), {
          jobId: job.jobId,
          datasourceId: ds.id,
        });
      });
    }

    const response: WarmCacheResponse = {
      jobIds,
      datasourcesQueued,
      estimatedDuration: datasourcesQueued.length * 120, // 2 min per datasource
      message: `Cache warming started for ${datasourcesQueued.length} datasource(s)`,
    };

    log.info('Bulk cache warming jobs created', {
      operation: 'cache_warm_all',
      jobCount: jobIds.length,
      datasourcesQueued,
      duration: Date.now() - startTime,
      component: 'analytics-cache-admin',
    });

    return createSuccessResponse(response);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error(
      'Failed to initiate cache warming',
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: 'cache_warm',
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
 * Warm datasource in background and update job tracker
 */
async function warmDatasourceBackground(jobId: string, datasourceId: number): Promise<void> {
  try {
    // Mark job as started
    cacheWarmingTracker.startJob(jobId);

    // Perform warming with progress callback
    const result = await indexedAnalyticsCache.warmCacheConcurrent(
      datasourceId,
      (progress) => {
        cacheWarmingTracker.updateProgress(jobId, {
          progress: progress.percent,
          rowsProcessed: progress.rowsProcessed,
          rowsTotal: progress.totalRows,
        });
      }
    );

    // Mark as completed
    if (!result.skipped) {
      cacheWarmingTracker.completeJob(jobId, result.entriesCached);
    } else {
      cacheWarmingTracker.failJob(jobId, 'Warming was skipped (already in progress)');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    cacheWarmingTracker.failJob(jobId, errorMessage);
    throw error;
  }
}

// Export with RBAC protection - only super admins can warm cache
export const POST = rbacRoute(warmCacheHandler, {
  permission: 'settings:update:all',
  rateLimit: 'api',
});

