/**
 * Redis FLUSHALL API
 *
 * POST /api/admin/redis/flushall
 *
 * Deletes ALL keys from Redis.
 * DANGEROUS OPERATION - requires super admin permission.
 *
 * Use during development when you need to completely reset Redis.
 * Deletes sessions, cache, rate limits, everything.
 *
 * RBAC: settings:update:all (Super Admin only)
 */

import type { NextRequest } from 'next/server';
import { createErrorResponse, handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { AuditLogger } from '@/lib/api/services/audit';
import { log } from '@/lib/logger';
import { getRedisClient, isRedisAvailable } from '@/lib/redis';
import type { UserContext } from '@/lib/types/rbac';

interface FlushAllResponse {
  success: true;
  message: string;
  keysBefore: number;
  keysAfter: number;
}

const flushAllHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    // Parse request body
    let body: { confirm?: boolean };
    try {
      body = await request.json();
    } catch {
      return createErrorResponse(
        'Invalid JSON body. POST body must be valid JSON with {"confirm": true}',
        400,
        request
      );
    }

    // Require explicit confirmation to prevent accidental FLUSHALL
    if (body.confirm !== true) {
      return createErrorResponse(
        'Confirmation required: POST body must include {"confirm": true}',
        400,
        request
      );
    }

    // Check if Redis is available
    if (!isRedisAvailable()) {
      return createErrorResponse('Redis is not available', 503, request);
    }

    const redis = getRedisClient();
    if (!redis) {
      return createErrorResponse('Redis client not available', 503, request);
    }

    log.info('FLUSHALL initiated', {
      operation: 'redis_flushall',
      userId: userContext.user_id,
      component: 'redis-admin',
    });

    // Get key count before flush
    const keysBefore = await redis.dbsize();

    // Execute FLUSHALL
    await redis.flushall();

    // Get key count after flush (should be 0)
    const keysAfter = await redis.dbsize();

    const duration = Date.now() - startTime;

    // Audit log the action
    await AuditLogger.logUserAction({
      action: 'redis_flushall',
      userId: userContext.user_id,
      resourceType: 'redis',
      resourceId: 'all',
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
      metadata: {
        keysBefore,
        keysAfter,
        duration,
        environment: process.env.ENVIRONMENT || 'development',
      },
    });

    // Log security event
    log.security('redis_flushall_executed', 'high', {
      action: 'redis_flushall',
      userId: userContext.user_id,
      keysBefore,
      keysAfter,
      duration,
      note: 'ALL Redis keys deleted',
    });

    const response: FlushAllResponse = {
      success: true,
      message: `FLUSHALL completed - ${keysBefore} keys deleted`,
      keysBefore,
      keysAfter,
    };

    log.info('FLUSHALL completed', {
      operation: 'redis_flushall',
      duration,
      keysBefore,
      keysAfter,
      userId: userContext.user_id,
      component: 'redis-admin',
    });

    return createSuccessResponse(response);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error(
      'FLUSHALL failed',
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: 'redis_flushall',
        duration,
        userId: userContext.user_id,
        component: 'redis-admin',
      }
    );

    return handleRouteError(error, 'Failed to flush Redis cache', request);
  }
};

// Export with RBAC protection - only super admins can flush all Redis
export const POST = rbacRoute(flushAllHandler, {
  permission: 'settings:update:all',
  rateLimit: 'api',
});
