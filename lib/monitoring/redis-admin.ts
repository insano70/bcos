/**
 * Redis Administration Service
 *
 * Provides admin functions for Redis cache management.
 * Features:
 * - Key search and filtering (using SCAN for safety)
 * - Key inspection with value display
 * - Pattern-based deletion with preview
 * - TTL management
 * - Statistics aggregation
 * - Hot key identification
 *
 * SAFETY:
 * - Uses SCAN instead of KEYS to avoid blocking Redis
 * - Preview mode for dangerous operations
 * - Audit logging for all write operations
 * - RBAC protection at API level
 */

import { log } from '@/lib/logger';
import { getRedisClient } from '@/lib/redis';

/**
 * Configuration constants for Redis operations
 */
const SCAN_COUNT = 100; // Items per SCAN iteration
const PREVIEW_KEY_LIMIT = 100; // Maximum keys to return in preview mode
const DELETE_BATCH_SIZE = 1000; // Keys to delete per batch to avoid blocking

/**
 * Redis key information
 */
export interface RedisKeyInfo {
  key: string;
  type: string;
  ttl: number; // seconds, -1 = no expiry, -2 = doesn't exist
  size: number; // bytes
}

/**
 * Redis key details with value
 */
export interface RedisKeyDetails extends RedisKeyInfo {
  value: unknown;
  encoding?: string;
}

/**
 * Redis statistics
 */
export interface RedisStatsData {
  connected: boolean;
  uptime: number; // seconds
  memory: {
    used: number; // MB
    total: number; // MB
    peak: number; // MB
    percentage: number;
    fragmentation: number;
  };
  keys: {
    total: number;
    byPattern: Record<string, number>;
  };
  stats: {
    hitRate: number;
    totalHits: number;
    totalMisses: number;
    opsPerSec: number;
    connectedClients: number;
    evictedKeys: number;
    expiredKeys: number;
    totalCommands: number;
  };
  commandStats: Record<string, number>;
}

/**
 * Purge operation result
 */
export interface PurgeResult {
  keysDeleted: number;
  pattern: string;
  keys?: string[]; // Returned in preview mode
}

/**
 * TTL update result
 */
export interface TTLUpdateResult {
  keysUpdated: number;
  pattern: string;
  ttl: number;
}

/**
 * Redis Administration Service
 */
export class RedisAdminService {
  /**
   * Get Redis statistics from INFO command
   */
  async getStats(): Promise<RedisStatsData | null> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        log.warn('Redis client not available', {
          operation: 'redis_get_stats',
          component: 'redis-admin',
        });
        return null;
      }

      // Get INFO for all sections
      const info = await redis.info();
      const parsedInfo = this.parseRedisInfo(info);

      // Get key counts by pattern
      const keyPrefix = this.getKeyPrefix();
      const patterns = [
        'chart:data:*',      // Chart data cache
        'cache:{ds:*',       // Indexed analytics cache entries
        'idx:{ds:*',         // Indexed analytics cache indexes
        'cache:meta:*',      // Cache metadata (last_warm timestamps)
        'ratelimit:*',       // Rate limiting counters
        'session:*',         // User sessions
      ];

      const keysByPattern: Record<string, number> = {};
      for (const pattern of patterns) {
        const fullPattern = `${keyPrefix}${pattern}`;
        const count = await this.countKeysByPattern(fullPattern);
        // Only include patterns that have keys
        if (count > 0) {
          keysByPattern[pattern] = count;
        }
      }

      // Calculate total keys
      const totalKeys = await this.countKeysByPattern(`${keyPrefix}*`);

      // Calculate hit rate
      const hits = parsedInfo.keyspace_hits || 0;
      const misses = parsedInfo.keyspace_misses || 0;
      const total = hits + misses;
      const hitRate = total > 0 ? (hits / total) * 100 : 0;

      return {
        connected: true,
        uptime: parsedInfo.uptime_in_seconds || 0,
        memory: {
          used: Math.round((parsedInfo.used_memory || 0) / 1024 / 1024), // Convert to MB
          total: Math.round((parsedInfo.maxmemory || 1073741824) / 1024 / 1024), // Default 1GB
          peak: Math.round((parsedInfo.used_memory_peak || 0) / 1024 / 1024),
          percentage: parsedInfo.maxmemory
            ? ((parsedInfo.used_memory || 0) / parsedInfo.maxmemory) * 100
            : 0,
          fragmentation: parsedInfo.mem_fragmentation_ratio || 1.0,
        },
        keys: {
          total: totalKeys,
          byPattern: keysByPattern,
        },
        stats: {
          hitRate,
          totalHits: hits,
          totalMisses: misses,
          opsPerSec: parsedInfo.instantaneous_ops_per_sec || 0,
          connectedClients: parsedInfo.connected_clients || 0,
          evictedKeys: parsedInfo.evicted_keys || 0,
          expiredKeys: parsedInfo.expired_keys || 0,
          totalCommands: parsedInfo.total_commands_processed || 0,
        },
        commandStats: this.parseCommandStats(info),
      };
    } catch (error) {
      log.error(
        'Failed to get Redis stats',
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: 'redis_get_stats',
          component: 'redis-admin',
        }
      );
      return null;
    }
  }

  /**
   * Search keys by pattern using SCAN (safe for production)
   *
   * @param pattern - Pattern to search (e.g., 'chart:*')
   * @param limit - Maximum number of keys to return
   * @returns Array of key information
   */
  async searchKeys(pattern: string, limit: number = 50): Promise<RedisKeyInfo[]> {
    try {
      const redis = getRedisClient();
      if (!redis) return [];

      const fullPattern = `${this.getKeyPrefix()}${pattern}`;
      const keys: string[] = [];

      // Use SCAN for safe iteration (doesn't block Redis)
      const stream = redis.scanStream({
        match: fullPattern,
        count: SCAN_COUNT,
      });

      for await (const batch of stream) {
        keys.push(...batch);
        if (keys.length >= limit) {
          stream.destroy();
          break;
        }
      }

      // Use pipeline to fetch all key details efficiently
      // This prevents keys from expiring between SCAN and detail queries
      const keysToFetch = keys.slice(0, limit);
      const pipeline = redis.pipeline();

      for (const key of keysToFetch) {
        pipeline.type(key);
        pipeline.ttl(key);
        pipeline.memory('USAGE', key);
      }

      const results = await pipeline.exec();

      if (!results) {
        return [];
      }

      // Process pipeline results (3 results per key: type, ttl, memory)
      const keyDetails: RedisKeyInfo[] = [];
      for (let i = 0; i < keysToFetch.length; i++) {
        const typeResult = results[i * 3];
        const ttlResult = results[i * 3 + 1];
        const sizeResult = results[i * 3 + 2];

        if (typeResult && ttlResult && sizeResult) {
          keyDetails.push({
            key: keysToFetch[i] || '',
            type: (typeResult[1] as string) || 'none',
            ttl: (ttlResult[1] as number) || -2,
            size: (sizeResult[1] as number) || 0,
          });
        }
      }

      return keyDetails;
    } catch (error) {
      log.error(
        'Failed to search Redis keys',
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: 'redis_search_keys',
          pattern,
          component: 'redis-admin',
        }
      );
      return [];
    }
  }

  /**
   * Get detailed information about a specific key
   *
   * @param key - Full key name
   * @returns Key details with value
   */
  async getKeyDetails(key: string): Promise<RedisKeyDetails | null> {
    try {
      const redis = getRedisClient();
      if (!redis) return null;

      const type = await redis.type(key);
      if (type === 'none') {
        return null; // Key doesn't exist
      }

      const ttl = await redis.ttl(key);
      const size = await this.getKeySize(key);

      // Get value based on type
      let value: unknown;
      switch (type) {
        case 'string':
          value = await redis.get(key);
          break;
        case 'hash':
          value = await redis.hgetall(key);
          break;
        case 'list':
          value = await redis.lrange(key, 0, -1);
          break;
        case 'set':
          value = await redis.smembers(key);
          break;
        case 'zset':
          value = await redis.zrange(key, 0, -1, 'WITHSCORES');
          break;
        default:
          value = null;
      }

      return {
        key,
        type,
        ttl,
        size,
        value,
      };
    } catch (error) {
      log.error(
        'Failed to get key details',
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: 'redis_get_key_details',
          key,
          component: 'redis-admin',
        }
      );
      return null;
    }
  }

  /**
   * Delete keys matching pattern (with preview mode)
   *
   * @param pattern - Pattern to match
   * @param preview - If true, only return count without deleting
   * @returns Purge result with count and optionally keys
   */
  async purgeByPattern(pattern: string, preview: boolean = false): Promise<PurgeResult> {
    try {
      // Validate pattern
      if (!pattern || pattern.trim().length === 0) {
        log.warn('Invalid purge pattern - empty or null', {
          pattern,
          operation: 'redis_purge_keys',
          component: 'redis-admin',
        });
        throw new Error('Pattern cannot be empty');
      }

      const redis = getRedisClient();
      if (!redis) {
        return { keysDeleted: 0, pattern };
      }

      const fullPattern = `${this.getKeyPrefix()}${pattern}`;
      const keys: string[] = [];

      // Absolute maximum to prevent OOM (covers largest datasource scenarios)
      const ABSOLUTE_MAX_KEYS = 50000;

      // Find matching keys using SCAN
      const stream = redis.scanStream({
        match: fullPattern,
        count: SCAN_COUNT,
      });

      for await (const batch of stream) {
        keys.push(...batch);

        // Safety check: Stop if we reach absolute maximum
        if (keys.length >= ABSOLUTE_MAX_KEYS) {
          log.warn('Reached absolute maximum keys limit during purge scan', {
            pattern: fullPattern,
            keysFound: keys.length,
            limit: ABSOLUTE_MAX_KEYS,
            operation: 'redis_purge_keys',
            component: 'redis-admin',
          });
          stream.destroy();
          break;
        }
      }

      // Preview mode - return keys without deleting
      if (preview) {
        return {
          keysDeleted: keys.length, // Return actual count for preview
          pattern,
          keys: keys.slice(0, PREVIEW_KEY_LIMIT),
        };
      }

      // Delete keys in batches
      let deleted = 0;
      if (keys.length > 0) {
        // Delete in batches to avoid blocking Redis
        for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
          const batch = keys.slice(i, i + DELETE_BATCH_SIZE);
          deleted += await redis.del(...batch);
        }
      }

      log.info('Redis keys purged', {
        operation: 'redis_purge_keys',
        pattern,
        keysDeleted: deleted,
        component: 'redis-admin',
      });

      return {
        keysDeleted: deleted,
        pattern,
      };
    } catch (error) {
      log.error(
        'Failed to purge Redis keys',
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: 'redis_purge_keys',
          pattern,
          preview,
          component: 'redis-admin',
        }
      );
      return { keysDeleted: 0, pattern };
    }
  }

  /**
   * Update TTL for keys matching pattern
   *
   * @param pattern - Pattern to match
   * @param ttl - New TTL in seconds (-1 to remove expiration)
   * @returns Update result with count
   */
  async updateTTLByPattern(pattern: string, ttl: number): Promise<TTLUpdateResult> {
    try {
      const redis = getRedisClient();
      if (!redis) {
        return { keysUpdated: 0, pattern, ttl };
      }

      const fullPattern = `${this.getKeyPrefix()}${pattern}`;
      const keys: string[] = [];

      // Find matching keys
      const stream = redis.scanStream({
        match: fullPattern,
        count: SCAN_COUNT,
      });

      for await (const batch of stream) {
        keys.push(...batch);
      }

      // Update TTL for each key
      let updated = 0;
      for (const key of keys) {
        if (ttl === -1) {
          await redis.persist(key);
        } else {
          await redis.expire(key, ttl);
        }
        updated++;
      }

      log.info('Redis TTL updated', {
        operation: 'redis_update_ttl',
        pattern,
        ttl,
        keysUpdated: updated,
        component: 'redis-admin',
      });

      return {
        keysUpdated: updated,
        pattern,
        ttl,
      };
    } catch (error) {
      log.error(
        'Failed to update Redis TTL',
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: 'redis_update_ttl',
          pattern,
          ttl,
          component: 'redis-admin',
        }
      );
      return { keysUpdated: 0, pattern, ttl };
    }
  }

  /**
   * Count keys matching pattern
   * Uses SCAN to avoid blocking
   */
  private async countKeysByPattern(pattern: string): Promise<number> {
    try {
      const redis = getRedisClient();
      if (!redis) return 0;

      let count = 0;
      const stream = redis.scanStream({
        match: pattern,
        count: SCAN_COUNT,
      });

      for await (const batch of stream) {
        count += batch.length;
      }

      return count;
    } catch {
      return 0;
    }
  }

  /**
   * Get memory usage for a key
   */
  private async getKeySize(key: string): Promise<number> {
    try {
      const redis = getRedisClient();
      if (!redis) return 0;

      // MEMORY USAGE returns bytes
      const size = await redis.memory('USAGE', key);
      return size || 0;
    } catch {
      // Fallback: estimate based on serialized size
      return 0;
    }
  }

  /**
   * Get environment key prefix
   */
  private getKeyPrefix(): string {
    const env = process.env.NODE_ENV || 'development';
    const environment = process.env.ENVIRONMENT || env;
    return `bcos:${environment}:`;
  }

  /**
   * Parse Redis INFO string into key-value object
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

  /**
   * Parse command statistics from INFO
   */
  private parseCommandStats(infoString: string): Record<string, number> {
    const lines = infoString.split('\r\n');
    const stats: Record<string, number> = {};
    let inCommandstats = false;

    for (const line of lines) {
      if (line.startsWith('# Commandstats')) {
        inCommandstats = true;
        continue;
      }

      if (line.startsWith('#')) {
        inCommandstats = false;
        continue;
      }

      if (inCommandstats && line) {
        // Line format: cmdstat_get:calls=123,usec=456,usec_per_call=3.70
        const match = line.match(/cmdstat_(\w+):calls=(\d+)/);
        if (match?.[1] && match[2]) {
          const command = match[1];
          const calls = match[2];
          stats[command.toUpperCase()] = parseInt(calls, 10);
        }
      }
    }

    return stats;
  }
}

// Singleton instance
export const redisAdminService = new RedisAdminService();
