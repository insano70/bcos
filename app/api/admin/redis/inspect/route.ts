/**
 * Redis Key Inspection API
 *
 * GET /api/admin/redis/inspect?key={key}
 *
 * Returns detailed information about a specific Redis key including its value.
 * Used for debugging and investigating cache contents.
 *
 * Query Parameters:
 * - key: Redis key to inspect (required)
 *
 * RBAC: settings:read:all (Super Admin only)
 * SECURITY: Audit logs all key inspections
 */

import type { NextRequest } from 'next/server';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { rbacRoute } from '@/lib/api/route-handlers';
import { AuditLogger } from '@/lib/api/services/audit';
import { log } from '@/lib/logger';
import { redisAdminService } from '@/lib/monitoring/redis-admin';
import { isRedisAvailable } from '@/lib/redis';
import type { UserContext } from '@/lib/types/rbac';

const redisInspectHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    // Check if Redis is available
    if (!isRedisAvailable()) {
      return createErrorResponse('Redis is not available', 503, request);
    }

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return createErrorResponse('key parameter is required', 400, request);
    }

    log.info('Redis key inspection initiated', {
      operation: 'redis_inspect_key',
      key,
      userId: userContext.user_id,
      component: 'redis-admin',
    });

    // Get key details
    const details = await redisAdminService.getKeyDetails(key);

    if (!details) {
      return createErrorResponse('Key not found or expired', 404, request);
    }

    // Audit log key inspection
    await AuditLogger.logUserAction({
      action: 'redis_key_inspected',
      userId: userContext.user_id,
      resourceType: 'redis_key',
      resourceId: key,
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
      metadata: {
        keyType: details.type,
        keySize: details.size,
        ttl: details.ttl,
      },
    });

    const duration = Date.now() - startTime;

    log.info('Redis key inspected', {
      operation: 'redis_inspect_key',
      duration,
      key,
      type: details.type,
      size: details.size,
      ttl: details.ttl,
      component: 'redis-admin',
    });

    return createSuccessResponse(details);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error(
      'Failed to inspect Redis key',
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: 'redis_inspect_key',
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

// Export with RBAC protection - only super admins can inspect keys
export const GET = rbacRoute(redisInspectHandler, {
  permission: 'settings:read:all',
  rateLimit: 'api',
});
