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
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { log } from '@/lib/logger';
import { indexedAnalyticsCache } from '@/lib/cache/indexed-analytics-cache';
import { chartConfigService } from '@/lib/services/chart-config-service';
import { cacheWarmingTracker } from '@/lib/monitoring/cache-warming-tracker';

interface InvalidateCacheRequest {
  datasourceId?: number; // Omit to invalidate all datasources
  reason?: string;       // Optional reason for audit trail
}

interface InvalidateCacheResponse {
  datasourcesInvalidated: number[];
  skipped: number[];
  duration: number;
  message: string;
}

const invalidateCacheHandler = async (request: NextRequest, userContext: { user_id: string }) => {
  const startTime = Date.now();

  try {
    const body = await request.json() as InvalidateCacheRequest;
    const { datasourceId, reason = 'Manual invalidation' } = body;

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

    const invalidated: number[] = [];
    const skipped: number[] = [];

    for (const ds of dataSources) {
      // Skip if currently warming
      if (cacheWarmingTracker.isWarming(ds.id)) {
        log.info('Skipping datasource - currently warming', {
          datasourceId: ds.id,
          datasourceName: ds.name,
        });
        skipped.push(ds.id);
        continue;
      }

      try {
        await indexedAnalyticsCache.invalidate(ds.id);
        invalidated.push(ds.id);

        log.info('Cache invalidated', {
          operation: 'cache_invalidate',
          datasourceId: ds.id,
          datasourceName: ds.name,
          reason,
          userId: userContext.user_id,
          component: 'analytics-cache-admin',
          auditAction: 'CACHE_INVALIDATE',
        });
      } catch (error) {
        log.error(
          'Failed to invalidate datasource',
          error instanceof Error ? error : new Error(String(error)),
          {
            datasourceId: ds.id,
            datasourceName: ds.name,
          }
        );
        skipped.push(ds.id);
      }
    }

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

    return createErrorResponse(
      error instanceof Error ? error : new Error(String(error)),
      500,
      request
    );
  }
};

// Export with RBAC protection - only super admins can invalidate cache
export const POST = rbacRoute(invalidateCacheHandler, {
  permission: 'settings:update:all',
  rateLimit: 'api',
});

