/**
 * Security Metrics Service
 *
 * Handles querying security metrics from database and Redis.
 * Provides counts of suspicious users, locked accounts, and CSRF blocks.
 *
 * **Non-CRUD Service** - Security monitoring operations only
 *
 * ## Error Handling Strategy
 *
 * - **Authorization Errors**: Service constructor throws `AuthorizationError` if user is not super admin
 * - **Metrics Query Errors**: Returns zeros instead of throwing (graceful degradation for monitoring)
 * - **Redis Errors**: Returns null instead of throwing (graceful degradation - Redis is optional)
 * - **Rationale**: Monitoring endpoints should not fail completely if one data source is unavailable
 *
 * @example
 * ```typescript
 * const service = createSecurityMetricsService(userContext);
 * const metrics = await service.getSecurityMetrics();
 * const redisStats = await service.getRedisStats();
 * ```
 */

// Third-party libraries
import { gte, sql } from 'drizzle-orm';

// Database
import { account_security, csrf_failure_events, db } from '@/lib/db';

// API utilities
import { requireSuperAdmin } from '@/lib/api/utils/rbac-guards';

// Logging
import { log } from '@/lib/logger';

// Redis
import { getRedisClient } from '@/lib/redis';

// Types
import type { UserContext } from '@/lib/types/rbac';

// Constants
import { SECURITY_MONITORING_TIME } from '@/lib/constants/security-monitoring';

// ============================================================
// INTERFACES
// ============================================================

export interface SecurityMetricsServiceInterface {
  /**
   * Get security metrics from database
   *
   * Retrieves counts of suspicious users, locked accounts, and recent CSRF blocks.
   * Returns zeros on error instead of throwing (graceful degradation).
   *
   * @returns Promise resolving to security metrics
   * @throws {AuthorizationError} If user is not super admin
   *
   * @example
   * ```typescript
   * const metrics = await service.getSecurityMetrics();
   * console.log(`${metrics.suspiciousUsers} suspicious users`);
   * console.log(`${metrics.lockedAccounts} locked accounts`);
   * console.log(`${metrics.csrfBlocks} CSRF blocks in last hour`);
   * ```
   */
  getSecurityMetrics(): Promise<SecurityMetrics>;

  /**
   * Get Redis cache statistics
   *
   * Retrieves hit rate, hits, misses, and operations per second from Redis.
   * Returns null if Redis is unavailable or on error (graceful degradation).
   *
   * @returns Promise resolving to Redis stats or null if unavailable
   *
   * @example
   * ```typescript
   * const stats = await service.getRedisStats();
   * if (stats) {
   *   console.log(`Redis hit rate: ${stats.hitRate.toFixed(2)}%`);
   *   console.log(`Operations per second: ${stats.opsPerSec}`);
   * }
   * ```
   */
  getRedisStats(): Promise<RedisStats | null>;
}

export interface SecurityMetrics {
  /** Count of users flagged with suspicious activity */
  suspiciousUsers: number;
  /** Count of currently locked accounts */
  lockedAccounts: number;
  /** Count of CSRF blocks in the last hour */
  csrfBlocks: number;
}

export interface RedisStats {
  /** Cache hit rate percentage (0-100) */
  hitRate: number;
  /** Total cache hits */
  hits: number;
  /** Total cache misses */
  misses: number;
  /** Instantaneous operations per second */
  opsPerSec: number;
}

// ============================================================
// IMPLEMENTATION
// ============================================================

class SecurityMetricsService {
  constructor(private readonly userContext: UserContext) {
    requireSuperAdmin(userContext, 'security monitoring');
  }

  async getSecurityMetrics(): Promise<SecurityMetrics> {
    const startTime = Date.now();

    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - SECURITY_MONITORING_TIME.MS_PER_HOUR);

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
   * @throws Never throws - returns empty object on parse errors
   * @note Filters out non-numeric values (e.g., Redis version strings)
   */
  private parseRedisInfo(infoString: string): Record<string, number> {
    const lines = infoString.split('\r\n');
    const info: Record<string, number> = {};

    for (const line of lines) {
      if (line && !line.startsWith('#')) {
        const parts = line.split(':');
        // Validate we have exactly 2 parts (key:value)
        if (parts.length === 2 && parts[0] && parts[1]) {
          const [key, value] = parts;
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
