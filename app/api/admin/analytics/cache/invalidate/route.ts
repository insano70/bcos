/**
 * Analytics Cache Invalidation API
 *
 * POST /api/admin/analytics/cache/invalidate
 *
 * Invalidates (clears) cache for analytics data sources:
 * - Single datasource invalidation
 * - Bulk "clear all" operation
 * - Audit logging for all operations
 * - Prevents invalidation of currently warming caches
 *
 * RBAC: settings:write:all (Super Admin only)
 */

import type { NextRequest } from 'next/server';
import { createErrorResponse, handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { indexedAnalyticsCache } from '@/lib/cache/indexed-analytics-cache';
import { log } from '@/lib/logger';
import { cacheWarmingTracker } from '@/lib/monitoring/cache-warming-tracker';
import { chartConfigService } from '@/lib/services/chart-config-service';
import { cacheInvalidateSchema } from '@/lib/validations/admin-cache';

interface InvalidateCacheResponse {
  datasourcesInvalidated: number[];
  skipped: number[];
  duration: number;
  message: string;
}

const invalidateCacheHandler = async (request: NextRequest, userContext: { user_id: string }) => {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const validated = cacheInvalidateSchema.parse(body);
    const { datasourceId, reason = 'Manual invalidation' } = validated;

    log.info('Cache invalidation request initiated', {
      operation: 'cache_invalidate',
      datasourceId,
      reason,
      userId: userContext.user_id,
      component: 'analytics-cache-admin',
    });

    // Single datasource invalidation
    if (datasourceId !== undefined) {
      // Check if currently warming
      if (cacheWarmingTracker.isWarming(datasourceId)) {
        return createErrorResponse(
          new Error('Cannot invalidate cache while warming is in progress'),
          409,
          request
        );
      }

      // Get datasource info for audit
      const datasource = await chartConfigService.getDataSourceConfigById(datasourceId);
      if (!datasource) {
        return createErrorResponse(
          new Error(`Data source ${datasourceId} not found`),
          404,
          request
        );
      }

      // Perform invalidation
      await indexedAnalyticsCache.invalidate(datasourceId);

      const duration = Date.now() - startTime;

      const response: InvalidateCacheResponse = {
        datasourcesInvalidated: [datasourceId],
        skipped: [],
        duration,
        message: `Cache invalidated for datasource ${datasourceId}`,
      };

      log.info('Cache invalidated successfully', {
        operation: 'cache_invalidate',
        datasourceId,
        datasourceName: datasource.name,
        reason,
        duration,
        userId: userContext.user_id,
        component: 'analytics-cache-admin',
        auditAction: 'CACHE_INVALIDATE',
      });

      return createSuccessResponse(response);
    }

    // Bulk invalidation (all datasources)
    const dataSources = await chartConfigService.getAllDataSources();

    if (dataSources.length === 0) {
      return createSuccessResponse({
        datasourcesInvalidated: [],
        skipped: [],
        duration: Date.now() - startTime,
        message: 'No data sources found to invalidate',
      });
    }

    // Separate warming datasources from those ready for invalidation
    const warmingDatasources = dataSources.filter((ds) => cacheWarmingTracker.isWarming(ds.id));
    const readyDatasources = dataSources.filter((ds) => !cacheWarmingTracker.isWarming(ds.id));

    // Log skipped warming datasources
    for (const ds of warmingDatasources) {
      log.info('Skipping datasource - currently warming', {
        datasourceId: ds.id,
        datasourceName: ds.name,
      });
    }

    // Invalidate all ready datasources in parallel
    const results = await Promise.allSettled(
      readyDatasources.map(async (ds) => {
        await indexedAnalyticsCache.invalidate(ds.id);
        log.info('Cache invalidated', {
          operation: 'cache_invalidate',
          datasourceId: ds.id,
          datasourceName: ds.name,
          reason,
          userId: userContext.user_id,
          component: 'analytics-cache-admin',
          auditAction: 'CACHE_INVALIDATE',
        });
        return ds;
      })
    );

    // Collect results
    const invalidated: number[] = [];
    const skipped: number[] = warmingDatasources.map((ds) => ds.id);

    results.forEach((result, i) => {
      const ds = readyDatasources[i];
      if (!ds) return;

      if (result.status === 'fulfilled') {
        invalidated.push(ds.id);
      } else {
        log.error('Failed to invalidate datasource', new Error(String(result.reason)), {
          datasourceId: ds.id,
          datasourceName: ds.name,
        });
        skipped.push(ds.id);
      }
    });

    const duration = Date.now() - startTime;

    const response: InvalidateCacheResponse = {
      datasourcesInvalidated: invalidated,
      skipped,
      duration,
      message: `Cache invalidated for ${invalidated.length} datasource(s)${
        skipped.length > 0 ? `, ${skipped.length} skipped` : ''
      }`,
    };

    log.info('Bulk cache invalidation completed', {
      operation: 'cache_invalidate_all',
      invalidatedCount: invalidated.length,
      skippedCount: skipped.length,
      reason,
      duration,
      userId: userContext.user_id,
      component: 'analytics-cache-admin',
      auditAction: 'CACHE_INVALIDATE_BULK',
    });

    return createSuccessResponse(response);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error(
      'Failed to invalidate cache',
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: 'cache_invalidate',
        duration,
        userId: userContext.user_id,
        component: 'analytics-cache-admin',
      }
    );

    return handleRouteError(error, 'Failed to invalidate cache', request);
  }
};

// Export with RBAC protection - only super admins can invalidate cache
export const POST = rbacRoute(invalidateCacheHandler, {
  permission: 'settings:update:all',
  rateLimit: 'api',
});
