/**
 * Redis Keys Search API
 *
 * GET /api/admin/redis/keys
 *
 * Searches Redis keys by pattern with pagination.
 * Returns key metadata (type, TTL, size) without values.
 *
 * Query Parameters:
 * - pattern: Search pattern (default: '*')
 * - page: Page number (default: 1)
 * - limit: Results per page (default: 50, max: 500)
 *
 * RBAC: settings:read:all (Super Admin only)
 * SAFETY: Uses SCAN instead of KEYS to avoid blocking Redis
 */

import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { log } from '@/lib/logger';
import { redisAdminService } from '@/lib/monitoring/redis-admin';
import { isRedisAvailable } from '@/lib/redis';
import type { RedisKeysResponse } from '@/lib/monitoring/types';

const redisKeysHandler = async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    // Check if Redis is available
    if (!isRedisAvailable()) {
      return createErrorResponse('Redis is not available', 503, request);
    }

    const { searchParams } = new URL(request.url);
    const pattern = searchParams.get('pattern') || '*';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 500);

    log.info('Redis keys search initiated', {
      operation: 'redis_search_keys',
      pattern,
      page,
      limit,
      component: 'redis-admin',
    });

    // Search keys using SCAN
    const keys = await redisAdminService.searchKeys(pattern, limit * page);

    // Paginate results
    const startIndex = (page - 1) * limit;
    const paginatedKeys = keys.slice(startIndex, startIndex + limit);

    const response: RedisKeysResponse = {
      keys: paginatedKeys,
      totalCount: keys.length,
      page,
      limit,
      pattern,
    };

    const duration = Date.now() - startTime;

    log.info('Redis keys retrieved', {
      operation: 'redis_search_keys',
      duration,
      pattern,
      keysFound: keys.length,
      keysReturned: paginatedKeys.length,
      component: 'redis-admin',
    });

    return createSuccessResponse(response);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error(
      'Failed to search Redis keys',
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: 'redis_search_keys',
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

// Export with RBAC protection - only super admins can browse Redis keys
export const GET = rbacRoute(redisKeysHandler, {
  permission: 'settings:read:all',
  rateLimit: 'api',
});

