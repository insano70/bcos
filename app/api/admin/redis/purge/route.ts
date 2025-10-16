/**
 * Redis Cache Purge API
 *
 * POST /api/admin/redis/purge
 *
 * Deletes Redis keys matching a pattern.
 * DANGEROUS OPERATION - requires confirmation and supports preview mode.
 *
 * Request Body:
 * - pattern: Pattern to match (e.g., 'chart:data:*')
 * - preview: If true, return count without deleting
 * - confirm: Must be true to execute deletion (ignored in preview mode)
 *
 * SECURITY:
 * - RBAC: settings:update:all (Super Admin only)
 * - Requires confirm=true for execution
 * - Preview mode for safety
 * - Full audit logging
 * - Rate limited to prevent abuse
 *
 * AUDIT:
 * - Logs all purge operations
 * - Records pattern and key count
 * - Includes admin user ID
 */

import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/route-handlers';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse } from '@/lib/api/responses/error';
import { log } from '@/lib/logger';
import { redisAdminService } from '@/lib/monitoring/redis-admin';
import { isRedisAvailable } from '@/lib/redis';
import { AuditLogger } from '@/lib/api/services/audit';
import type { UserContext } from '@/lib/types/rbac';
import type { RedisPurgeResult } from '@/lib/monitoring/types';

interface PurgeRequest {
  pattern: string;
  preview?: boolean;
  confirm?: boolean;
}

const redisPurgeHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    // Check if Redis is available
    if (!isRedisAvailable()) {
      return createErrorResponse('Redis is not available', 503, request);
    }

    // Parse request body
    const body = (await request.json()) as PurgeRequest;

    if (!body.pattern || body.pattern.trim().length === 0) {
      return createErrorResponse('pattern field is required', 400, request);
    }

    const { pattern, preview = false, confirm = false } = body;

    // Safety check: require confirmation for actual deletion
    if (!preview && !confirm) {
      return createErrorResponse(
        'Confirmation required: set confirm=true to execute deletion',
        400,
        request
      );
    }

    log.info('Redis cache purge initiated', {
      operation: 'redis_purge_cache',
      pattern,
      preview,
      confirm,
      userId: userContext.user_id,
      component: 'redis-admin',
    });

    // Execute purge (or preview)
    const result = await redisAdminService.purgeByPattern(pattern, preview);

    const response: RedisPurgeResult = {
      success: true,
      keysDeleted: result.keysDeleted,
      pattern,
      preview,
      keys: result.keys,
    };

    // Audit log actual deletions (not previews)
    if (!preview && result.keysDeleted > 0) {
      await AuditLogger.logUserAction({
        action: 'redis_cache_purged',
        userId: userContext.user_id,
        resourceType: 'redis_cache',
        resourceId: pattern,
        ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '',
        metadata: {
          pattern,
          keysDeleted: result.keysDeleted,
          environment: process.env.ENVIRONMENT || 'development',
        },
      });

      // Log security event for cache purge
      log.security('redis_cache_purged', 'medium', {
        action: 'admin_purge_cache',
        userId: userContext.user_id,
        pattern,
        keysDeleted: result.keysDeleted,
      });
    }

    const duration = Date.now() - startTime;

    log.info('Redis cache purge completed', {
      operation: 'redis_purge_cache',
      duration,
      pattern,
      keysDeleted: result.keysDeleted,
      preview,
      userId: userContext.user_id,
      component: 'redis-admin',
    });

    return createSuccessResponse(response);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error(
      'Failed to purge Redis cache',
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: 'redis_purge_cache',
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

// Export with RBAC protection - only super admins can purge cache
export const POST = rbacRoute(redisPurgeHandler, {
  permission: 'settings:update:all',
  rateLimit: 'api',
});

