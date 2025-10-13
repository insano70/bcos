/**
 * Rate Limit Cache Service
 *
 * Redis-based rate limiting for global enforcement across all instances
 *
 * KEY NAMING CONVENTION:
 *   ratelimit:ip:{ip}:{window}
 *   ratelimit:user:{userId}:{window}
 *   ratelimit:endpoint:{path}:{window}
 *   ratelimit:global:api:{window}
 *
 * TTL STRATEGY:
 * - Keys auto-expire after 2x window duration for safety
 * - Uses atomic INCR operation for thread-safe counting
 */

import { getRedisClient } from '@/lib/redis';
import { log } from '@/lib/logger';

/**
 * Rate limit result
 */
export interface RateLimitResult {
  allowed: boolean;
  current: number;
  limit: number;
  remaining: number;
  resetTime: number;
  resetAt: number;
}

/**
 * Rate limit cache service
 * Multi-instance safe using Redis atomic operations
 */
class RateLimitCacheService {
  private readonly namespace = 'ratelimit';

  /**
   * Build Redis key for rate limiting
   * Format: ratelimit:{type}:{identifier}:{window}
   */
  private buildKey(type: string, identifier: string, window: number): string {
    return `${this.namespace}:${type}:${identifier}:${window}`;
  }

  /**
   * Check and increment rate limit
   * Uses atomic INCR operation for thread-safe counting
   *
   * @param type - Rate limit type (ip, user, endpoint, global)
   * @param identifier - Identifier (IP address, user ID, etc.)
   * @param limit - Maximum requests allowed in window
   * @param windowSeconds - Time window in seconds
   * @returns RateLimitResult with current count and whether request is allowed
   */
  async checkRateLimit(
    type: string,
    identifier: string,
    limit: number,
    windowSeconds: number
  ): Promise<RateLimitResult> {
    const client = getRedisClient();

    // Graceful degradation if Redis unavailable
    if (!client) {
      log.warn('Redis unavailable, allowing request (fail-open)', {
        type,
        identifier: type === 'ip' ? '[REDACTED]' : identifier,
        gracefulDegradation: true,
      });
      return {
        allowed: true,
        current: 0,
        limit,
        remaining: limit,
        resetTime: Date.now() + windowSeconds * 1000,
        resetAt: Math.floor(Date.now() / 1000) + windowSeconds,
      };
    }

    try {
      const now = Math.floor(Date.now() / 1000);
      const window = Math.floor(now / windowSeconds) * windowSeconds;
      const key = this.buildKey(type, identifier, window);

      // Atomic increment
      const count = await client.incr(key);

      // Set expiry on first request (when count === 1)
      if (count === 1) {
        await client.expire(key, windowSeconds * 2); // 2x for safety margin
      }

      const allowed = count <= limit;
      const remaining = Math.max(0, limit - count);
      const resetTime = (window + windowSeconds) * 1000; // Convert to milliseconds
      const resetAt = window + windowSeconds;

      // Log rate limit checks (debug level to avoid spam)
      if (!allowed) {
        log.warn('Rate limit exceeded', {
          type,
          identifier: type === 'ip' ? '[REDACTED]' : identifier,
          current: count,
          limit,
          window: windowSeconds,
          resetAt,
        });
      }

      return {
        allowed,
        current: count,
        limit,
        remaining,
        resetTime,
        resetAt,
      };
    } catch (error) {
      log.error(
        'Rate limit check failed, allowing request (fail-open)',
        error instanceof Error ? error : new Error(String(error)),
        {
          type,
          identifier: type === 'ip' ? '[REDACTED]' : identifier,
          gracefulDegradation: true,
        }
      );

      // Fail open - allow request if Redis operation fails
      return {
        allowed: true,
        current: 0,
        limit,
        remaining: limit,
        resetTime: Date.now() + windowSeconds * 1000,
        resetAt: Math.floor(Date.now() / 1000) + windowSeconds,
      };
    }
  }

  /**
   * Check IP-based rate limit
   *
   * @param ip - IP address
   * @param limit - Maximum requests allowed in window
   * @param windowSeconds - Time window in seconds
   */
  async checkIpRateLimit(
    ip: string,
    limit: number,
    windowSeconds: number
  ): Promise<RateLimitResult> {
    return this.checkRateLimit('ip', ip, limit, windowSeconds);
  }

  /**
   * Check user-based rate limit
   *
   * @param userId - User ID
   * @param limit - Maximum requests allowed in window
   * @param windowSeconds - Time window in seconds
   */
  async checkUserRateLimit(
    userId: string,
    limit: number,
    windowSeconds: number
  ): Promise<RateLimitResult> {
    return this.checkRateLimit('user', userId, limit, windowSeconds);
  }

  /**
   * Check endpoint-based rate limit
   *
   * @param endpoint - Endpoint path
   * @param limit - Maximum requests allowed in window
   * @param windowSeconds - Time window in seconds
   */
  async checkEndpointRateLimit(
    endpoint: string,
    limit: number,
    windowSeconds: number
  ): Promise<RateLimitResult> {
    return this.checkRateLimit('endpoint', endpoint, limit, windowSeconds);
  }

  /**
   * Check global API rate limit
   *
   * @param limit - Maximum requests allowed in window
   * @param windowSeconds - Time window in seconds
   */
  async checkGlobalRateLimit(
    limit: number,
    windowSeconds: number
  ): Promise<RateLimitResult> {
    return this.checkRateLimit('global', 'api', limit, windowSeconds);
  }

  /**
   * Reset rate limit for specific identifier
   * Useful for admin override or testing
   *
   * @param type - Rate limit type
   * @param identifier - Identifier
   */
  async resetRateLimit(type: string, identifier: string): Promise<void> {
    const client = getRedisClient();
    if (!client) {
      log.warn('Redis unavailable, cannot reset rate limit', {
        type,
        identifier: type === 'ip' ? '[REDACTED]' : identifier,
      });
      return;
    }

    try {
      // Delete all keys matching the pattern
      const pattern = `${this.namespace}:${type}:${identifier}:*`;

      // Use SCAN to find and delete keys (cluster-safe)
      let cursor = '0';
      let deletedCount = 0;

      do {
        const result = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = result[0];
        const keys = result[1];

        if (keys.length > 0) {
          // Delete keys one at a time to avoid CROSSSLOT errors in cluster mode
          for (const key of keys) {
            await client.del(key);
            deletedCount++;
          }
        }
      } while (cursor !== '0');

      log.info('Rate limit reset', {
        type,
        identifier: type === 'ip' ? '[REDACTED]' : identifier,
        deletedKeys: deletedCount,
      });
    } catch (error) {
      log.error(
        'Failed to reset rate limit',
        error instanceof Error ? error : new Error(String(error)),
        {
          type,
          identifier: type === 'ip' ? '[REDACTED]' : identifier,
        }
      );
    }
  }
}

// Export singleton instance
export const rateLimitCache = new RateLimitCacheService();
