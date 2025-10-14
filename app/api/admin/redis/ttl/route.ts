/**
 * Redis TTL Update API
 *
 * POST /api/admin/redis/ttl
 *
 * Updates TTL (time to live) for Redis keys matching a pattern.
 * Useful for extending session timeouts or preventing premature expiration.
 *
 * Request Body:
 * - pattern: Pattern to match (e.g., 'session:*')
 * - ttl: New TTL in seconds (-1 to remove expiration)
 * - preview: If true, return count without updating
 *
 * SECURITY:
 * - RBAC: settings:update:all (Super Admin only)
 * - Preview mode for safety
 * - Full audit logging
 * - Rate limited
 *
 * AUDIT:
 * - Logs all TTL updates
 * - Records pattern, TTL value, and key count
 */

import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { log } from '@/lib/logger';
import { redisAdminService } from '@/lib/monitoring/redis-admin';
import { isRedisAvailable } from '@/lib/redis';
import { AuditLogger } from '@/lib/api/services/audit';
import type { UserContext } from '@/lib/types/rbac';
import type { RedisTTLUpdateResult } from '@/lib/monitoring/types';

interface TTLUpdateRequest {
  pattern: string;
  ttl: number; // seconds, -1 to remove expiration
  preview?: boolean;
}

const redisTTLHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    // Check if Redis is available
    if (!isRedisAvailable()) {
      return createErrorResponse('Redis is not available', 503, request);
    }

    // Parse request body
    const body = (await request.json()) as TTLUpdateRequest;

    if (!body.pattern || body.pattern.trim().length === 0) {
      return createErrorResponse('pattern field is required', 400, request);
    }

    if (typeof body.ttl !== 'number') {
      return createErrorResponse('ttl field must be a number', 400, request);
    }

    const { pattern, ttl, preview = false } = body;

    log.info('Redis TTL update initiated', {
      operation: 'redis_update_ttl',
      pattern,
      ttl,
      preview,
      userId: userContext.user_id,
      component: 'redis-admin',
    });

    // Execute TTL update (or preview)
    const result = await redisAdminService.updateTTLByPattern(pattern, preview ? 0 : ttl);

    const response: RedisTTLUpdateResult = {
      success: true,
      keysUpdated: preview ? 0 : result.keysUpdated,
      pattern,
      ttl,
    };

    // Audit log actual updates (not previews)
    if (!preview && result.keysUpdated > 0) {
      await AuditLogger.logUserAction({
        action: 'redis_ttl_updated',
        userId: userContext.user_id,
        resourceType: 'redis_cache',
        resourceId: pattern,
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
        metadata: {
          pattern,
          ttl,
          keysUpdated: result.keysUpdated,
          environment: process.env.ENVIRONMENT || 'development',
        },
      });

      // Log security event for TTL changes
      log.security('redis_ttl_updated', 'low', {
        action: 'admin_update_ttl',
        userId: userContext.user_id,
        pattern,
        ttl,
        keysUpdated: result.keysUpdated,
      });
    }

    const duration = Date.now() - startTime;

    log.info('Redis TTL update completed', {
      operation: 'redis_update_ttl',
      duration,
      pattern,
      ttl,
      keysUpdated: result.keysUpdated,
      preview,
      userId: userContext.user_id,
      component: 'redis-admin',
    });

    return createSuccessResponse(response);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error(
      'Failed to update Redis TTL',
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: 'redis_update_ttl',
        duration,
        userId: userContext.user_id,
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

// Export with RBAC protection - only super admins can update TTLs
export const POST = rbacRoute(redisTTLHandler, {
  permission: 'settings:update:all',
  rateLimit: 'api',
});

