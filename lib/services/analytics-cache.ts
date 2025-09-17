import type { AnalyticsQueryParams, AnalyticsQueryResult } from '@/lib/types/analytics';
import { logger } from '@/lib/logger';

/**
 * Analytics Query Result Caching Service
 * Intelligent caching to reduce database load and improve performance
 */

interface CacheEntry {
  key: string;
  data: AnalyticsQueryResult;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
  accessCount: number;
  lastAccessed: number;
}

export class AnalyticsCache {
  private cache = new Map<string, CacheEntry>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 1000;
  private readonly CLEANUP_INTERVAL = 60 * 1000; // 1 minute

  constructor() {
    // Start periodic cleanup
    setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL);
  }

  /**
   * Generate cache key from query parameters and user context
   */
  private generateCacheKey(params: AnalyticsQueryParams, userId: string): string {
    const keyData = {
      ...params,
      userId, // Include user ID for security
    };
    
    // Sort keys for consistent hashing
    const sortedKeys = Object.keys(keyData).sort();
    const keyString = sortedKeys.map(key => `${key}:${keyData[key as keyof typeof keyData]}`).join('|');
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < keyString.length; i++) {
      const char = keyString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return `analytics_${Math.abs(hash).toString(36)}`;
  }

  /**
   * Get cached result if available and not expired
   */
  get(params: AnalyticsQueryParams, userId: string): AnalyticsQueryResult | null {
    const key = this.generateCacheKey(params, userId);
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    const now = Date.now();
    
    // Check if expired
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      logger.debug('Cache entry expired and removed', { key });
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = now;

    logger.debug('Cache hit', { 
      key, 
      age: now - entry.timestamp,
      accessCount: entry.accessCount 
    });

    // Mark as cache hit
    return {
      ...entry.data,
      cache_hit: true
    };
  }

  /**
   * Store query result in cache
   */
  set(params: AnalyticsQueryParams, userId: string, data: AnalyticsQueryResult, customTtl?: number): void {
    const key = this.generateCacheKey(params, userId);
    const now = Date.now();
    const ttl = customTtl || this.DEFAULT_TTL;

    // Determine TTL based on data characteristics
    const intelligentTtl = this.calculateIntelligentTtl(params, data, ttl);

    const entry: CacheEntry = {
      key,
      data: { ...data, cache_hit: false }, // Store original cache_hit status
      timestamp: now,
      ttl: intelligentTtl,
      accessCount: 0,
      lastAccessed: now
    };

    // Check cache size and evict if necessary
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.evictLeastRecentlyUsed();
    }

    this.cache.set(key, entry);

    logger.debug('Cache entry stored', { 
      key, 
      ttl: intelligentTtl,
      dataSize: data.data.length,
      queryTime: data.query_time_ms
    });
  }

  /**
   * Calculate intelligent TTL based on query characteristics
   */
  private calculateIntelligentTtl(params: AnalyticsQueryParams, data: AnalyticsQueryResult, defaultTtl: number): number {
    let ttl = defaultTtl;

    // Longer TTL for historical data (older start dates)
    if (params.start_date) {
      const startDate = new Date(params.start_date);
      const monthsAgo = (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
      
      if (monthsAgo > 6) {
        ttl = ttl * 4; // 20 minutes for historical data
      } else if (monthsAgo > 3) {
        ttl = ttl * 2; // 10 minutes for older data
      }
    }

    // Longer TTL for larger datasets (more expensive queries)
    if (data.data.length > 1000) {
      ttl = ttl * 2;
    }

    // Longer TTL for slow queries
    if (data.query_time_ms > 1000) {
      ttl = ttl * 1.5;
    }

    // Shorter TTL for real-time data (current month)
    if (params.frequency === 'Weekly' || (params.end_date && new Date(params.end_date) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))) {
      ttl = ttl * 0.5; // 2.5 minutes for recent data
    }

    return Math.min(ttl, 60 * 60 * 1000); // Cap at 1 hour
  }

  /**
   * Evict least recently used entries
   */
  private evictLeastRecentlyUsed(): void {
    const entries = Array.from(this.cache.entries());
    
    // Sort by last accessed time (oldest first)
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    
    // Remove oldest 10% of entries
    const toRemove = Math.ceil(entries.length * 0.1);
    
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }

    logger.debug('Cache eviction completed', { 
      removedEntries: toRemove,
      remainingEntries: this.cache.size 
    });
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.debug('Cache cleanup completed', { 
        removedExpired: removedCount,
        remainingEntries: this.cache.size 
      });
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    logger.info('Cache cleared', { previousSize: size });
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    oldestEntry?: Date;
    newestEntry?: Date;
  } {
    const entries = Array.from(this.cache.values());
    const totalAccess = entries.reduce((sum, entry) => sum + entry.accessCount, 0);
    const totalHits = entries.filter(entry => entry.accessCount > 0).length;

    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      hitRate: totalAccess > 0 ? (totalHits / totalAccess) * 100 : 0,
      oldestEntry: entries.length > 0 ? new Date(Math.min(...entries.map(e => e.timestamp))) : undefined,
      newestEntry: entries.length > 0 ? new Date(Math.max(...entries.map(e => e.timestamp))) : undefined,
    };
  }

  /**
   * Invalidate cache entries matching pattern
   */
  invalidatePattern(pattern: Partial<AnalyticsQueryParams>): number {
    let invalidatedCount = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      // Simple pattern matching - in production you'd want more sophisticated matching
      const shouldInvalidate = Object.entries(pattern).every(([patternKey, patternValue]) => {
        return key.includes(`${patternKey}:${patternValue}`);
      });

      if (shouldInvalidate) {
        this.cache.delete(key);
        invalidatedCount++;
      }
    }

    logger.info('Cache invalidation completed', { 
      pattern,
      invalidatedCount,
      remainingEntries: this.cache.size 
    });

    return invalidatedCount;
  }
}

// Export singleton instance
export const analyticsCache = new AnalyticsCache();
