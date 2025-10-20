/**
 * Indexed Analytics Cache Client
 *
 * Low-level Redis operations for indexed analytics cache.
 * Extends CacheService base class for consistent error handling and logging.
 *
 * RESPONSIBILITIES:
 * - Redis GET/SET/DEL operations
 * - Multi-get (MGET) for batch fetching
 * - Set operations (SADD, SMEMBERS, SINTERSTORE, SUNIONSTORE)
 * - Pipeline management for batch writes
 * - Distributed locking
 *
 * ARCHITECTURE:
 * - Extends CacheService<T> base class
 * - Graceful degradation when Redis unavailable
 * - Consistent error handling and logging
 * - Type-safe operations
 */

import type { Redis } from 'ioredis';
import { log } from '@/lib/logger';
import { CacheService } from '@/lib/cache/base';

/**
 * Indexed Analytics Cache Client
 * Handles all Redis interactions for indexed cache
 */
export class IndexedCacheClient extends CacheService<Record<string, unknown>[]> {
  protected namespace = 'indexed-analytics';
  protected defaultTTL = 172800; // 48 hours (2 days)

  private readonly BATCH_SIZE = 5000; // Pipeline batch size for writes
  private readonly QUERY_BATCH_SIZE = 10000; // Max keys for MGET

  /**
   * Get cached data for a single key
   *
   * @param key - Cache key
   * @returns Cached data or null
   */
  async getCached(key: string): Promise<Record<string, unknown>[] | null> {
    return this.get<Record<string, unknown>[]>(key);
  }

  /**
   * Get cached data for multiple keys (batch fetch)
   * Handles large result sets by batching MGET operations
   *
   * @param keys - Array of cache keys
   * @returns Array of cached data arrays (null entries excluded)
   */
  async mget(keys: string[]): Promise<Record<string, unknown>[][]> {
    const startTime = Date.now();
    const client = this.getClient();
    if (!client) {
      return [];
    }

    const results: Record<string, unknown>[][] = [];
    let totalNetworkTime = 0;
    let totalParseTime = 0;
    let totalRows = 0;

    try {
      // Process in batches to avoid overwhelming Redis
      for (let i = 0; i < keys.length; i += this.QUERY_BATCH_SIZE) {
        const batch = keys.slice(i, i + this.QUERY_BATCH_SIZE);

        // Measure network time (Redis round-trip)
        const networkStart = Date.now();
        const values = await client.mget(...batch);
        const networkTime = Date.now() - networkStart;
        totalNetworkTime += networkTime;

        // Measure JSON parsing time
        const parseStart = Date.now();
        for (const value of values) {
          if (value) {
            try {
              const parsed = JSON.parse(value) as Record<string, unknown>[];
              results.push(parsed);
              totalRows += parsed.length;
            } catch (parseError) {
              log.error(
                'Failed to parse cached data in mget',
                parseError instanceof Error ? parseError : new Error(String(parseError)),
                {
                  component: 'indexed-cache-client',
                  operation: 'mget',
                }
              );
            }
          }
        }
        totalParseTime += Date.now() - parseStart;
      }

      const totalTime = Date.now() - startTime;
      const otherTime = totalTime - totalNetworkTime - totalParseTime;

      // Log detailed timing breakdown for performance analysis
      log.debug('MGET operation timing breakdown', {
        component: 'indexed-cache-client',
        operation: 'mget',
        keyCount: keys.length,
        resultCount: results.length,
        totalRows,
        timing: {
          total: totalTime,
          network: totalNetworkTime,
          parse: totalParseTime,
          other: otherTime,
          networkPct: ((totalNetworkTime / totalTime) * 100).toFixed(1),
          parsePct: ((totalParseTime / totalTime) * 100).toFixed(1),
        },
        efficiency: {
          msPerKey: (totalTime / keys.length).toFixed(2),
          msPerRow: totalRows > 0 ? (totalTime / totalRows).toFixed(3) : 'N/A',
        },
      });

      return results;
    } catch (error) {
      log.error(
        'MGET operation failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'indexed-cache-client',
          operation: 'mget',
          keyCount: keys.length,
          duration: Date.now() - startTime,
        }
      );
      return [];
    }
  }

  /**
   * Set cached data with TTL
   *
   * @param key - Cache key
   * @param data - Data to cache
   * @param ttl - Time to live in seconds (optional)
   * @returns Success boolean
   */
  async setCached(
    key: string,
    data: Record<string, unknown>[],
    ttl?: number
  ): Promise<boolean> {
    return this.set(key, data, { ttl: ttl || this.defaultTTL });
  }

  /**
   * Add key to a set (index)
   *
   * @param setKey - Set (index) key
   * @param member - Member to add (cache key)
   * @returns Success boolean
   */
  async sadd(setKey: string, member: string): Promise<boolean> {
    const client = this.getClient();
    if (!client) {
      return false;
    }

    try {
      await client.sadd(setKey, member);
      return true;
    } catch (error) {
      log.error(
        'SADD operation failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'indexed-cache-client',
          operation: 'sadd',
          setKey,
        }
      );
      return false;
    }
  }

  /**
   * Get all members of a set (index)
   *
   * @param setKey - Set (index) key
   * @returns Array of members (cache keys)
   */
  async smembers(setKey: string): Promise<string[]> {
    const client = this.getClient();
    if (!client) {
      return [];
    }

    try {
      return await client.smembers(setKey);
    } catch (error) {
      log.error(
        'SMEMBERS operation failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'indexed-cache-client',
          operation: 'smembers',
          setKey,
        }
      );
      return [];
    }
  }

  /**
   * Get cardinality (count) of a set
   *
   * @param setKey - Set (index) key
   * @returns Number of members in set
   */
  async scard(setKey: string): Promise<number> {
    const client = this.getClient();
    if (!client) {
      return 0;
    }

    try {
      return await client.scard(setKey);
    } catch (error) {
      log.error(
        'SCARD operation failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'indexed-cache-client',
          operation: 'scard',
          setKey,
        }
      );
      return 0;
    }
  }

  /**
   * Get random member from a set (for sampling)
   *
   * @param setKey - Set (index) key
   * @returns Random member or null
   */
  async srandmember(setKey: string): Promise<string | null> {
    const client = this.getClient();
    if (!client) {
      return null;
    }

    try {
      const result = await client.srandmember(setKey);
      return typeof result === 'string' ? result : null;
    } catch (error) {
      log.error(
        'SRANDMEMBER operation failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'indexed-cache-client',
          operation: 'srandmember',
          setKey,
        }
      );
      return null;
    }
  }

  /**
   * Union multiple sets and store result
   *
   * @param destination - Destination key for result
   * @param keys - Source set keys to union
   * @returns Number of members in resulting set
   */
  async sunionstore(destination: string, ...keys: string[]): Promise<number> {
    const client = this.getClient();
    if (!client) {
      return 0;
    }

    try {
      return await client.sunionstore(destination, ...keys);
    } catch (error) {
      log.error(
        'SUNIONSTORE operation failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'indexed-cache-client',
          operation: 'sunionstore',
          destination,
          sourceCount: keys.length,
        }
      );
      return 0;
    }
  }

  /**
   * Intersect multiple sets and store result
   *
   * @param destination - Destination key for result
   * @param keys - Source set keys to intersect
   * @returns Number of members in resulting set
   */
  async sinterstore(destination: string, ...keys: string[]): Promise<number> {
    const client = this.getClient();
    if (!client) {
      return 0;
    }

    try {
      return await client.sinterstore(destination, ...keys);
    } catch (error) {
      log.error(
        'SINTERSTORE operation failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'indexed-cache-client',
          operation: 'sinterstore',
          destination,
          sourceCount: keys.length,
        }
      );
      return 0;
    }
  }

  /**
   * Set expiration on a key
   *
   * @param key - Key to expire
   * @param seconds - Seconds until expiration
   * @returns Success boolean
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    const client = this.getClient();
    if (!client) {
      return false;
    }

    try {
      const result = await client.expire(key, seconds);
      return result === 1;
    } catch (error) {
      log.error(
        'EXPIRE operation failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'indexed-cache-client',
          operation: 'expire',
          key,
          seconds,
        }
      );
      return false;
    }
  }

  /**
   * Get memory usage of a key
   *
   * NOTE: This method is disabled because the Redis MEMORY command is not available
   * in all Redis versions. Always returns null to prevent performance degradation
   * from repeated command failures (~1 second timeout per failed call).
   *
   * See: Performance regression investigation 2025-10-19
   *
   * @param key - Key to check (unused)
   * @returns Always returns null (memory estimation disabled)
   */
  async memoryUsage(_key: string): Promise<number | null> {
    // DISABLED: Redis MEMORY command not universally supported
    // Returning null immediately prevents ~1 second timeout per call
    return null;
  }

  /**
   * Acquire distributed lock
   *
   * @param lockKey - Lock key
   * @param ttlSeconds - Lock expiration time
   * @returns True if lock acquired, false otherwise
   */
  async acquireLock(lockKey: string, ttlSeconds: number): Promise<boolean> {
    const client = this.getClient();
    if (!client) {
      return false;
    }

    try {
      const result = await client.set(lockKey, '1', 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch (error) {
      log.error(
        'Failed to acquire lock',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'indexed-cache-client',
          operation: 'acquire_lock',
          lockKey,
        }
      );
      return false;
    }
  }

  /**
   * Release distributed lock
   *
   * @param lockKey - Lock key to release
   * @returns Success boolean
   */
  async releaseLock(lockKey: string): Promise<boolean> {
    return this.del(lockKey);
  }

  /**
   * Create Redis pipeline for batch operations
   *
   * @returns Pipeline instance or null
   */
  createPipeline(): ReturnType<Redis['pipeline']> | null {
    const client = this.getClient();
    if (!client) {
      return null;
    }

    return client.pipeline();
  }

  /**
   * Execute pipeline and check for errors
   *
   * @param pipeline - Pipeline to execute
   * @returns Success boolean
   */
  async executePipeline(
    pipeline: ReturnType<Redis['pipeline']>
  ): Promise<{ success: boolean; errorCount: number }> {
    try {
      const results = await pipeline.exec();

      if (!results) {
        return { success: false, errorCount: 0 };
      }

      const errors = results.filter(([err]) => err !== null);

      if (errors.length > 0) {
        log.error('Redis pipeline execution had errors', {
          component: 'indexed-cache-client',
          operation: 'execute_pipeline',
          errorCount: errors.length,
          sampleErrors: errors.slice(0, 3).map(([err]) => err?.message),
        });
        return { success: false, errorCount: errors.length };
      }

      return { success: true, errorCount: 0 };
    } catch (error) {
      log.error(
        'Pipeline execution failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'indexed-cache-client',
          operation: 'execute_pipeline',
        }
      );
      return { success: false, errorCount: 1 };
    }
  }

  /**
   * Required by CacheService base class
   * Invalidate cache entries (delegates to parent delPattern)
   */
  async invalidate(pattern?: string): Promise<void> {
    if (pattern) {
      await this.delPattern(pattern);
    }
  }

  /**
   * Get batch size for pipeline operations
   */
  getBatchSize(): number {
    return this.BATCH_SIZE;
  }

  /**
   * Get query batch size for MGET operations
   */
  getQueryBatchSize(): number {
    return this.QUERY_BATCH_SIZE;
  }

  /**
   * Delete multiple keys (public wrapper for protected delMany)
   */
  async deleteMany(keys: string[]): Promise<number> {
    return this.delMany(keys);
  }

  /**
   * Scan for keys (public wrapper for protected scan)
   */
  async scanKeys(pattern: string, limit?: number): Promise<string[]> {
    return this.scan(pattern, limit);
  }

  /**
   * Delete single key (public wrapper for protected del)
   */
  async deleteKey(key: string): Promise<boolean> {
    return this.del(key);
  }

  /**
   * Get the default TTL configured for this cache
   *
   * @returns Default TTL in seconds
   */
  getDefaultTTL(): number {
    return this.defaultTTL;
  }
}

// Export singleton instance
export const cacheClient = new IndexedCacheClient();
