/**
 * Base Cache Service
 *
 * Abstract base class for all cache services. Provides common caching operations
 * with consistent error handling, logging, and key naming conventions.
 *
 * KEY NAMING STANDARD:
 * ✅ GOOD: Hierarchical, predictable, colon-separated
 *   user:123
 *   user:123:permissions
 *   user:123:profile
 *   user:list:active
 *   user:email:alice@example.com
 *
 * ❌ BAD: Inconsistent, collision-prone
 *   user_123
 *   users:123:data
 *   userPermissions:123
 *
 * PATTERN:
 *   {namespace}:{identifier}[:{subresource}]
 *   {namespace}:list:{filter}
 *   {namespace}:{index}:{value}
 *
 * USAGE:
 * ```typescript
 * class UserCacheService extends CacheService<User> {
 *   protected namespace = 'user';
 *   protected defaultTTL = 300; // 5 minutes
 *
 *   async getUser(userId: string): Promise<User | null> {
 *     return this.get(this.buildKey(userId));
 *   }
 * }
 * ```
 */

import type Redis from 'ioredis';
import { log } from '@/lib/logger';
import { getRedisClient } from '@/lib/redis';
import type { CacheOptions } from './types';

export abstract class CacheService<T = unknown> {
  /**
   * Cache namespace (e.g., 'user', 'product', 'order')
   * Used as the first part of all cache keys
   */
  protected abstract namespace: string;

  /**
   * Default TTL in seconds for this cache service
   */
  protected abstract defaultTTL: number;

  /**
   * Build a cache key following the standard naming convention
   *
   * @param parts - Key parts to join with colons
   * @returns Formatted cache key: {namespace}:part1:part2:...
   *
   * @example
   * buildKey('123') // => 'user:123'
   * buildKey('123', 'permissions') // => 'user:123:permissions'
   * buildKey('list', 'active') // => 'user:list:active'
   */
  protected buildKey(...parts: (string | number)[]): string {
    return [this.namespace, ...parts].join(':');
  }

  /**
   * Get value from cache
   *
   * @param key - Cache key (without prefix - Redis client adds environment prefix)
   * @returns Cached value or null if not found/error
   */
  protected async get<R = T>(key: string): Promise<R | null> {
    const client = getRedisClient();
    if (!client) {
      log.debug('Redis not available, skipping cache get', {
        component: 'cache',
        namespace: this.namespace,
        key,
      });
      return null;
    }

    try {
      const value = await client.get(key);
      if (!value) {
        return null;
      }

      // Parse JSON with error handling for corrupted cache data
      try {
        const parsed = JSON.parse(value);
        return parsed as R;
      } catch (parseError) {
        log.error(
          'Redis data corrupted - invalidating cache',
          parseError instanceof Error ? parseError : new Error(String(parseError)),
          {
            component: 'cache',
            namespace: this.namespace,
            key,
            operation: 'GET',
            action: 'invalidating_cache',
          }
        );

        // Delete corrupted cache entry (fire and forget)
        client.del(key).catch(() => {});

        // Return null to trigger fallback
        return null;
      }
    } catch (error) {
      log.error('Redis GET failed', error instanceof Error ? error : new Error(String(error)), {
        component: 'cache',
        namespace: this.namespace,
        key,
        operation: 'GET',
      });
      return null;
    }
  }

  /**
   * Set value in cache
   *
   * @param key - Cache key (without prefix)
   * @param value - Value to cache (will be JSON serialized)
   * @param options - Cache options (ttl overrides defaultTTL)
   * @returns true if successful, false otherwise
   */
  protected async set<R = T>(key: string, value: R, options?: CacheOptions): Promise<boolean> {
    const client = getRedisClient();
    if (!client) {
      return false;
    }

    try {
      const ttl = options?.ttl ?? this.defaultTTL;
      await client.setex(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      log.error('Redis SET failed', error instanceof Error ? error : new Error(String(error)), {
        component: 'cache',
        namespace: this.namespace,
        key,
        operation: 'SET',
      });
      return false;
    }
  }

  /**
   * Delete key from cache
   *
   * @param key - Cache key (without prefix)
   * @returns true if key was deleted, false otherwise
   */
  protected async del(key: string): Promise<boolean> {
    const client = getRedisClient();
    if (!client) {
      return false;
    }

    try {
      const result = await client.del(key);
      return result > 0;
    } catch (error) {
      log.error('Redis DEL failed', error instanceof Error ? error : new Error(String(error)), {
        component: 'cache',
        namespace: this.namespace,
        key,
        operation: 'DEL',
      });
      return false;
    }
  }

  /**
   * Delete multiple keys from cache
   *
   * @param keys - Array of cache keys (without prefix)
   * @returns Number of keys deleted
   */
  protected async delMany(keys: string[]): Promise<number> {
    const client = getRedisClient();
    if (!client || keys.length === 0) {
      return 0;
    }

    try {
      // Delete keys one at a time to avoid CROSSSLOT errors in cluster mode
      let deleted = 0;
      for (const key of keys) {
        const result = await client.del(key);
        deleted += result;
      }
      return deleted;
    } catch (error) {
      log.error(
        'Redis DEL many failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'cache',
          namespace: this.namespace,
          keyCount: keys.length,
          operation: 'DEL_MANY',
        }
      );
      return 0;
    }
  }

  /**
   * Delete keys matching a pattern
   * Uses SCAN to find keys safely in cluster mode
   *
   * @param pattern - Pattern to match (e.g., "user:*:permissions")
   * @returns Number of keys deleted
   */
  protected async delPattern(pattern: string): Promise<number> {
    const client = getRedisClient();
    if (!client) {
      return 0;
    }

    try {
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

      log.debug('Keys deleted by pattern', {
        component: 'cache',
        namespace: this.namespace,
        pattern,
        deletedCount,
      });

      return deletedCount;
    } catch (error) {
      log.error(
        'Redis DEL pattern failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'cache',
          namespace: this.namespace,
          pattern,
          operation: 'DEL_PATTERN',
        }
      );
      return 0;
    }
  }

  /**
   * Check if key exists in cache
   *
   * @param key - Cache key (without prefix)
   * @returns true if key exists, false otherwise
   */
  protected async exists(key: string): Promise<boolean> {
    const client = getRedisClient();
    if (!client) {
      return false;
    }

    try {
      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      log.error('Redis EXISTS failed', error instanceof Error ? error : new Error(String(error)), {
        component: 'cache',
        namespace: this.namespace,
        key,
        operation: 'EXISTS',
      });
      return false;
    }
  }

  /**
   * Scan for keys matching a pattern
   *
   * Uses SCAN command which is cluster-safe (unlike KEYS).
   * Pattern should NOT include the environment prefix (e.g., "bcos:dev:") as that's added automatically.
   *
   * @param pattern - Pattern to match (e.g., "user:*" or "user:list:*")
   * @param limit - Maximum number of keys to return (default: 100)
   * @returns Array of matching keys
   */
  protected async scan(pattern: string, limit: number = 100): Promise<string[]> {
    const client = getRedisClient();
    if (!client) {
      return [];
    }

    try {
      const keys: string[] = [];
      let cursor = '0';

      do {
        const result: [string, string[]] = await client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100
        );
        cursor = result[0];
        keys.push(...result[1]);
      } while (cursor !== '0' && keys.length < limit);

      return keys.slice(0, limit);
    } catch (error) {
      log.error('Redis SCAN failed', error instanceof Error ? error : new Error(String(error)), {
        component: 'cache',
        namespace: this.namespace,
        pattern,
        operation: 'SCAN',
      });
      return [];
    }
  }

  /**
   * Get Redis client for advanced operations
   *
   * Use sparingly - prefer the built-in methods when possible.
   *
   * @returns Redis client or null if not available
   */
  protected getClient(): Redis | null {
    return getRedisClient();
  }

  /**
   * Invalidate cache entries
   *
   * Subclasses must implement this method to define their invalidation logic.
   *
   * @param args - Arguments specific to the cache service
   */
  abstract invalidate(...args: unknown[]): Promise<void>;
}
