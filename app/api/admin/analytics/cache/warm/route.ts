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
import { z } from 'zod';
import { createErrorResponse, handleRouteError, ValidationError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { cacheWarmingService } from '@/lib/cache/data-source/cache-warming';
import { log } from '@/lib/logger';
import { cacheWarmingTracker } from '@/lib/monitoring/cache-warming-tracker';
import { chartConfigService } from '@/lib/services/chart-config-service';
import { db } from '@/lib/db';
import { chart_data_sources } from '@/lib/db/chart-config-schema';
import { eq } from 'drizzle-orm';

/**
 * Request validation schema for cache warming
 */
const warmCacheRequestSchema = z.object({
  datasourceId: z.number().int().positive().optional(),
  force: z.boolean().optional().default(false),
});

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
    const rawBody = await request.json();
    const parseResult = warmCacheRequestSchema.safeParse(rawBody);

    if (!parseResult.success) {
      return createErrorResponse(
        ValidationError(parseResult.error.flatten().fieldErrors, 'Invalid request body'),
        400,
        request
      );
    }

    const { datasourceId, force } = parseResult.data;

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
      warmDatasourceBackground(job.jobId, datasourceId).catch((error) => {
        log.error(
          'Background cache warming failed',
          error instanceof Error ? error : new Error(String(error)),
          {
            jobId: job.jobId,
            datasourceId,
          }
        );
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
      warmDatasourceBackground(job.jobId, ds.id).catch((error) => {
        log.error(
          'Background cache warming failed',
          error instanceof Error ? error : new Error(String(error)),
          {
            jobId: job.jobId,
            datasourceId: ds.id,
          }
        );
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

    return handleRouteError(error, 'Failed to warm cache', request);
  }
};

/**
 * Warm datasource in background and update job tracker
 */
async function warmDatasourceBackground(jobId: string, datasourceId: number): Promise<void> {
  try {
    // Mark job as started
    cacheWarmingTracker.startJob(jobId);

    // Query database directly to get data source type (cache may not include this field)
    const dataSourceInfo = await db
      .select({
        dataSourceType: chart_data_sources.data_source_type,
        name: chart_data_sources.data_source_name,
      })
      .from(chart_data_sources)
      .where(eq(chart_data_sources.data_source_id, datasourceId))
      .limit(1);

    if (!dataSourceInfo || dataSourceInfo.length === 0 || !dataSourceInfo[0]) {
      throw new Error(`Data source ${datasourceId} not found`);
    }

    const { dataSourceType, name } = dataSourceInfo[0];

    log.info('Cache warming routing by data source type', {
      datasourceId,
      datasourceName: name,
      dataSourceType,
      component: 'analytics-cache-admin',
    });

    // Route to appropriate warming service based on data source type
    // Delegate to cacheWarmingService which handles both types correctly
    const result = await cacheWarmingService.warmDataSource(datasourceId);

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
