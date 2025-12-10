/**
 * Redis Statistics API
 *
 * GET /api/admin/redis/stats
 *
 * Returns Redis cache statistics including memory usage, hit rates, and key counts.
 * Used by the admin command center to monitor cache performance.
 *
 * RBAC: settings:read:all (Super Admin only)
 */

import type { NextRequest } from 'next/server';
import { createErrorResponse, handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { log } from '@/lib/logger';
import { redisAdminService } from '@/lib/monitoring/redis-admin';
import { isRedisAvailable } from '@/lib/redis';

const redisStatsHandler = async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    // Check if Redis is available
    if (!isRedisAvailable()) {
      return createErrorResponse('Redis is not available', 503, request);
    }

    log.info('Redis stats request initiated', {
      operation: 'redis_get_stats',
      component: 'redis-admin',
    });

    // Get statistics from Redis
    const stats = await redisAdminService.getStats();

    if (!stats) {
      return handleRouteError(new Error('Failed to retrieve Redis statistics'), 'Failed to retrieve Redis statistics', request);
    }

    const duration = Date.now() - startTime;

    log.info('Redis stats retrieved', {
      operation: 'redis_get_stats',
      duration,
      totalKeys: stats.keys.total,
      memoryUsed: stats.memory.used,
      hitRate: stats.stats.hitRate.toFixed(2),
      component: 'redis-admin',
    });

    return createSuccessResponse(stats);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error(
      'Failed to get Redis stats',
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: 'redis_get_stats',
        duration,
        component: 'redis-admin',
      }
    );

    return createErrorResponse(
      error instanceof Error ? error : new Error(String(error)),
      500,
      request
    );
  }
};

// Export with RBAC protection - only super admins can view Redis stats
export const GET = rbacRoute(redisStatsHandler, {
  permission: 'settings:read:all',
  rateLimit: 'api',
});
