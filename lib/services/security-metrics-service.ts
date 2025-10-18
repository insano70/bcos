/**
 * Security Metrics Service
 *
 * Handles querying security metrics from database and Redis.
 * Provides counts of suspicious users, locked accounts, and CSRF blocks.
 *
 * **Non-CRUD Service** - Security monitoring operations only
 *
 * @example
 * ```typescript
 * const service = createSecurityMetricsService(userContext);
 * const metrics = await service.getSecurityMetrics();
 * const redisStats = await service.getRedisStats();
 * ```
 */

import { gte, sql } from 'drizzle-orm';
import { account_security, csrf_failure_events, db } from '@/lib/db';
import { log } from '@/lib/logger';
import { AuthorizationError } from '@/lib/api/responses/error';
import type { UserContext } from '@/lib/types/rbac';
import { getRedisClient } from '@/lib/redis';

// ============================================================
// INTERFACES
// ============================================================

export interface SecurityMetricsServiceInterface {
  getSecurityMetrics(): Promise<SecurityMetrics>;
  getRedisStats(): Promise<RedisStats | null>;
}

export interface SecurityMetrics {
  suspiciousUsers: number;
  lockedAccounts: number;
  csrfBlocks: number;
}

export interface RedisStats {
  hitRate: number;
  hits: number;
  misses: number;
  opsPerSec: number;
}

// ============================================================
// IMPLEMENTATION
// ============================================================

class SecurityMetricsService {
  constructor(private readonly userContext: UserContext) {
    // Super admin only - no complex RBAC needed
    if (!userContext.is_super_admin) {
      throw AuthorizationError('Super admin access required for security monitoring');
    }
  }

  async getSecurityMetrics(): Promise<SecurityMetrics> {
    const startTime = Date.now();

    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Get counts from account_security table
      const [securityStats] = await db
        .select({
          suspiciousUsers: sql<number>`COUNT(*) FILTER (WHERE ${account_security.suspicious_activity_detected} = true)`,
          lockedAccounts: sql<number>`COUNT(*) FILTER (WHERE ${account_security.locked_until} > ${now})`,
        })
        .from(account_security);

      // Get CSRF blocks from last hour
      const [csrfStats] = await db
        .select({
          count: sql<number>`COUNT(*)`,
        })
        .from(csrf_failure_events)
        .where(gte(csrf_failure_events.timestamp, oneHourAgo));

      const duration = Date.now() - startTime;

      log.info('security metrics retrieved', {
        operation: 'get_security_metrics',
        userId: this.userContext.user_id,
        duration,
        component: 'service',
      });

      return {
        suspiciousUsers: securityStats?.suspiciousUsers || 0,
        lockedAccounts: securityStats?.lockedAccounts || 0,
        csrfBlocks: csrfStats?.count || 0,
      };
    } catch (error) {
      log.error('get security metrics failed', error, {
        operation: 'get_security_metrics',
        userId: this.userContext.user_id,
        duration: Date.now() - startTime,
        component: 'service',
      });

      // Return zeros on error (don't fail completely)
      return {
        suspiciousUsers: 0,
        lockedAccounts: 0,
        csrfBlocks: 0,
      };
    }
  }

  async getRedisStats(): Promise<RedisStats | null> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        return null;
      }

      // Get Redis INFO stats section
      const info = await redis.info('stats');

      // Parse INFO string
      const stats = this.parseRedisInfo(info);

      // Calculate hit rate
      const hits = stats.keyspace_hits || 0;
      const misses = stats.keyspace_misses || 0;
      const total = hits + misses;
      const hitRate = total > 0 ? (hits / total) * 100 : 0;

      return {
        hitRate,
        hits,
        misses,
        opsPerSec: stats.instantaneous_ops_per_sec || 0,
      };
    } catch (error) {
      log.error('get Redis stats failed', error, {
        operation: 'get_redis_stats',
        userId: this.userContext.user_id,
        component: 'service',
      });
      return null;
    }
  }

  /**
   * Parse Redis INFO command output
   *
   * @param infoString - Raw INFO response from Redis
   * @returns Parsed key-value pairs as numbers
   */
  private parseRedisInfo(infoString: string): Record<string, number> {
    const lines = infoString.split('\r\n');
    const info: Record<string, number> = {};

    for (const line of lines) {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          const numValue = parseFloat(value);
          if (!Number.isNaN(numValue)) {
            info[key] = numValue;
          }
        }
      }
    }

    return info;
  }
}

// ============================================================
// FACTORY
// ============================================================

/**
 * Create Security Metrics Service
 *
 * Handles querying security metrics from database and Redis.
 * Super admin access required.
 *
 * @param userContext - User context (must be super admin)
 * @returns Service interface
 * @throws {AuthorizationError} If user is not super admin
 *
 * @example
 * ```typescript
 * const service = createSecurityMetricsService(userContext);
 * const metrics = await service.getSecurityMetrics();
 * console.log(`${metrics.suspiciousUsers} suspicious users detected`);
 *
 * const redisStats = await service.getRedisStats();
 * if (redisStats) {
 *   console.log(`Redis hit rate: ${redisStats.hitRate.toFixed(2)}%`);
 * }
 * ```
 */
export function createSecurityMetricsService(
  userContext: UserContext
): SecurityMetricsServiceInterface {
  return new SecurityMetricsService(userContext);
}
