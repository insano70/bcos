/**
 * Key Generator for Indexed Analytics Cache
 *
 * Pure utility functions for generating cache keys and index patterns.
 * No side effects, no dependencies - stateless key construction.
 *
 * KEY FORMAT:
 * Cache: cache:{ds:id}:m:{measure}:p:{practice}:prov:{provider}:freq:{frequency}
 * Index: idx:{ds:id}:m:{measure}:p:{practice}:freq:{frequency}
 * Metadata: cache:meta:{ds:id}:last_warm
 *
 * REDIS HASH TAGS:
 * Uses {ds:id} hash tags to ensure all keys for a datasource hash to the same slot
 * in Redis Cluster. This enables SINTERSTORE/SUNIONSTORE operations across indexes.
 *
 * EXAMPLES:
 * - Cache key: cache:{ds:1}:m:Revenue:p:114:prov:501:freq:monthly
 * - Index key: idx:{ds:1}:m:Revenue:p:114:freq:monthly
 * - Master index: idx:{ds:1}:master
 */

/**
 * Cache entry structure (partial - only fields needed for key generation)
 */
export interface CacheKeyEntry {
  datasourceId: number;
  measure: string;
  practiceUid: number;
  providerUid: number | null;
  frequency: string;
}

/**
 * Key Generator Utility
 * Stateless functions for cache key construction
 */
export const KeyGenerator = {
  /**
   * Generate cache key for data storage
   * Format: cache:{ds:id}:m:{measure}:p:{practice}:prov:{provider}:freq:{frequency}
   *
   * @param entry - Cache entry fields
   * @returns Cache key string
   *
   * @example
   * getCacheKey({ datasourceId: 1, measure: 'Revenue', practiceUid: 114, providerUid: 501, frequency: 'monthly' })
   * // => "cache:{ds:1}:m:Revenue:p:114:prov:501:freq:monthly"
   */
  getCacheKey(entry: CacheKeyEntry): string {
    const { datasourceId, measure, practiceUid, providerUid, frequency } = entry;
    return `cache:{ds:${datasourceId}}:m:${measure}:p:${practiceUid}:prov:${providerUid || '*'}:freq:${frequency}`;
  },

  /**
   * Generate all index keys for this entry
   * Creates indexes at multiple granularities for flexible querying
   *
   * Index hierarchy:
   * 1. Master index - for invalidation (all cache keys for datasource)
   * 2. Base query - measure + frequency
   * 3. With practice - measure + practice + frequency
   * 4. With provider - measure + frequency + provider
   * 5. Full combination - measure + practice + provider + frequency
   *
   * @param entry - Cache entry fields
   * @returns Array of index key strings
   *
   * @example
   * getIndexKeys({ datasourceId: 1, measure: 'Revenue', practiceUid: 114, providerUid: 501, frequency: 'monthly' })
   * // => [
   * //   "idx:{ds:1}:master",
   * //   "idx:{ds:1}:m:Revenue:freq:monthly",
   * //   "idx:{ds:1}:m:Revenue:p:114:freq:monthly",
   * //   "idx:{ds:1}:m:Revenue:freq:monthly:prov:501",
   * //   "idx:{ds:1}:m:Revenue:p:114:prov:501:freq:monthly"
   * // ]
   */
  getIndexKeys(entry: CacheKeyEntry): string[] {
    const {
      datasourceId: ds,
      measure: m,
      practiceUid: p,
      providerUid: prov,
      frequency: freq,
    } = entry;

    return [
      // Master index for invalidation
      `idx:{ds:${ds}}:master`,

      // Base query index (measure + frequency)
      `idx:{ds:${ds}}:m:${m}:freq:${freq}`,

      // With practice filter
      `idx:{ds:${ds}}:m:${m}:p:${p}:freq:${freq}`,

      // With provider filter
      `idx:{ds:${ds}}:m:${m}:freq:${freq}:prov:${prov || '*'}`,

      // Full combination
      `idx:{ds:${ds}}:m:${m}:p:${p}:prov:${prov || '*'}:freq:${freq}`,
    ];
  },

  /**
   * Generate master index key for a datasource
   * Used for efficient invalidation and cache stats
   *
   * @param datasourceId - Data source ID
   * @returns Master index key
   *
   * @example
   * getMasterIndexKey(1) // => "idx:{ds:1}:master"
   */
  getMasterIndexKey(datasourceId: number): string {
    return `idx:{ds:${datasourceId}}:master`;
  },

  /**
   * Generate metadata key for last warming timestamp
   *
   * @param datasourceId - Data source ID
   * @returns Metadata key
   *
   * @example
   * getMetadataKey(1) // => "cache:meta:{ds:1}:last_warm"
   */
  getMetadataKey(datasourceId: number): string {
    return `cache:meta:{ds:${datasourceId}}:last_warm`;
  },

  /**
   * Generate base index key for measure + frequency queries
   * Used as starting point for filtered queries
   *
   * @param datasourceId - Data source ID
   * @param measure - Measure name
   * @param frequency - Time frequency
   * @returns Base index key
   *
   * @example
   * getBaseIndexKey(1, 'Revenue', 'monthly') // => "idx:{ds:1}:m:Revenue:freq:monthly"
   */
  getBaseIndexKey(datasourceId: number, measure: string, frequency: string): string {
    return `idx:{ds:${datasourceId}}:m:${measure}:freq:${frequency}`;
  },

  /**
   * Generate practice-specific index key
   *
   * @param datasourceId - Data source ID
   * @param measure - Measure name
   * @param practiceUid - Practice UID
   * @param frequency - Time frequency
   * @returns Practice index key
   *
   * @example
   * getPracticeIndexKey(1, 'Revenue', 114, 'monthly') // => "idx:{ds:1}:m:Revenue:p:114:freq:monthly"
   */
  getPracticeIndexKey(
    datasourceId: number,
    measure: string,
    practiceUid: number,
    frequency: string
  ): string {
    return `idx:{ds:${datasourceId}}:m:${measure}:p:${practiceUid}:freq:${frequency}`;
  },

  /**
   * Generate provider-specific index key
   *
   * @param datasourceId - Data source ID
   * @param measure - Measure name
   * @param frequency - Time frequency
   * @param providerUid - Provider UID
   * @returns Provider index key
   *
   * @example
   * getProviderIndexKey(1, 'Revenue', 'monthly', 501) // => "idx:{ds:1}:m:Revenue:freq:monthly:prov:501"
   */
  getProviderIndexKey(
    datasourceId: number,
    measure: string,
    frequency: string,
    providerUid: number
  ): string {
    return `idx:{ds:${datasourceId}}:m:${measure}:freq:${frequency}:prov:${providerUid}`;
  },

  /**
   * Generate index pattern for scanning (with wildcards)
   *
   * @param datasourceId - Data source ID
   * @returns Index pattern for SCAN operations
   *
   * @example
   * getIndexPattern(1) // => "idx:{ds:1}:*"
   */
  getIndexPattern(datasourceId: number): string {
    return `idx:{ds:${datasourceId}}:*`;
  },

  /**
   * Generate temporary key for set operations (SINTERSTORE/SUNIONSTORE)
   * Uses hash tag and timestamp + random for uniqueness
   *
   * @param datasourceId - Data source ID
   * @param operation - Operation type (union/intersect/result)
   * @returns Temporary key
   *
   * @example
   * getTempKey(1, 'union') // => "temp:{ds:1}:union:1234567890:0.123456"
   */
  getTempKey(datasourceId: number, operation: 'union' | 'intersect' | 'result'): string {
    return `temp:{ds:${datasourceId}}:${operation}:${Date.now()}:${Math.random()}`;
  },

  /**
   * Generate lock key for distributed locking
   *
   * @param datasourceId - Data source ID
   * @returns Lock key
   *
   * @example
   * getLockKey(1) // => "lock:cache:warm:{ds:1}"
   */
  getLockKey(datasourceId: number): string {
    return `lock:cache:warm:{ds:${datasourceId}}`;
  },

  /**
   * Generate shadow cache key for atomic swap pattern
   * Shadow keys are written during warming, then atomically renamed to production keys
   * Format: shadow:{ds:id}:m:{measure}:p:{practice}:prov:{provider}:freq:{frequency}
   *
   * @param entry - Cache entry fields
   * @returns Shadow cache key string
   *
   * @example
   * getShadowCacheKey({ datasourceId: 1, measure: 'Revenue', practiceUid: 114, providerUid: 501, frequency: 'monthly' })
   * // => "shadow:{ds:1}:m:Revenue:p:114:prov:501:freq:monthly"
   */
  getShadowCacheKey(entry: CacheKeyEntry): string {
    const { datasourceId, measure, practiceUid, providerUid, frequency } = entry;
    return `shadow:{ds:${datasourceId}}:m:${measure}:p:${practiceUid}:prov:${providerUid || '*'}:freq:${frequency}`;
  },

  /**
   * Generate shadow index keys for atomic swap pattern
   * Shadow indexes are built during warming, then atomically renamed to production indexes
   *
   * @param entry - Cache entry fields
   * @returns Array of shadow index key strings
   *
   * @example
   * getShadowIndexKeys({ datasourceId: 1, measure: 'Revenue', practiceUid: 114, providerUid: 501, frequency: 'monthly' })
   * // => [
   * //   "shadow_idx:{ds:1}:master",
   * //   "shadow_idx:{ds:1}:m:Revenue:freq:monthly",
   * //   ...
   * // ]
   */
  getShadowIndexKeys(entry: CacheKeyEntry): string[] {
    const {
      datasourceId: ds,
      measure: m,
      practiceUid: p,
      providerUid: prov,
      frequency: freq,
    } = entry;

    return [
      // Master index for invalidation
      `shadow_idx:{ds:${ds}}:master`,

      // Base query index (measure + frequency)
      `shadow_idx:{ds:${ds}}:m:${m}:freq:${freq}`,

      // With practice filter
      `shadow_idx:{ds:${ds}}:m:${m}:p:${p}:freq:${freq}`,

      // With provider filter
      `shadow_idx:{ds:${ds}}:m:${m}:freq:${freq}:prov:${prov || '*'}`,

      // Full combination
      `shadow_idx:{ds:${ds}}:m:${m}:p:${p}:prov:${prov || '*'}:freq:${freq}`,
    ];
  },

  /**
   * Generate shadow cache pattern for SCAN operations
   *
   * IMPORTANT: Includes wildcard prefix (*) because ioredis keyPrefix
   * is NOT automatically applied to SCAN patterns.
   *
   * @param datasourceId - Data source ID
   * @returns Shadow cache pattern with wildcard prefix
   *
   * @example
   * getShadowCachePattern(1) // => "*shadow:{ds:1}:*"
   */
  getShadowCachePattern(datasourceId: number): string {
    return `*shadow:{ds:${datasourceId}}:*`;
  },

  /**
   * Generate shadow index pattern for SCAN operations
   *
   * IMPORTANT: Includes wildcard prefix (*) because ioredis keyPrefix
   * is NOT automatically applied to SCAN patterns.
   *
   * @param datasourceId - Data source ID
   * @returns Shadow index pattern with wildcard prefix
   *
   * @example
   * getShadowIndexPattern(1) // => "*shadow_idx:{ds:1}:*"
   */
  getShadowIndexPattern(datasourceId: number): string {
    return `*shadow_idx:{ds:${datasourceId}}:*`;
  },

  /**
   * Parse cache key back into components
   * Useful for debugging and statistics
   *
   * @param key - Cache key to parse
   * @returns Parsed components or null if invalid format
   *
   * @example
   * parseCacheKey("cache:{ds:1}:m:Revenue:p:114:prov:501:freq:monthly")
   * // => { datasourceId: 1, measure: 'Revenue', practiceUid: 114, providerUid: 501, frequency: 'monthly' }
   */
  parseCacheKey(key: string): CacheKeyEntry | null {
    // Format: cache:{ds:ID}:m:MEASURE:p:PRACTICE:prov:PROVIDER:freq:FREQUENCY
    const pattern =
      /^cache:\{ds:(\d+)\}:m:([^:]+):p:(\d+):prov:([\d*]+):freq:([^:]+)$/;
    const match = key.match(pattern);

    if (!match) {
      return null;
    }

    const datasourceIdStr = match[1];
    const measure = match[2];
    const practiceUidStr = match[3];
    const providerStr = match[4];
    const frequencyStr = match[5];

    if (!datasourceIdStr || !measure || !practiceUidStr || !providerStr || !frequencyStr) {
      return null;
    }

    const datasourceId = Number.parseInt(datasourceIdStr, 10);
    const practiceUid = Number.parseInt(practiceUidStr, 10);
    const frequency = frequencyStr;

    if (
      Number.isNaN(datasourceId) ||
      !measure ||
      Number.isNaN(practiceUid) ||
      !frequency
    ) {
      return null;
    }

    const providerUid =
      providerStr === '*' ? null : Number.parseInt(providerStr, 10);

    if (providerStr !== '*' && Number.isNaN(providerUid as number)) {
      return null;
    }

    return {
      datasourceId,
      measure,
      practiceUid,
      providerUid,
      frequency,
    };
  },

  /**
   * Parse index key to extract metadata
   * Used for statistics collection
   *
   * @param key - Index key to parse
   * @returns Extracted metadata or null if invalid
   *
   * @example
   * parseIndexKey("idx:{ds:1}:m:Revenue:p:114:freq:monthly")
   * // => { datasourceId: 1, measure: 'Revenue', practiceUid: 114, frequency: 'monthly' }
   */
  parseIndexKey(
    key: string
  ): {
    datasourceId: number;
    measure?: string;
    practiceUid?: number;
    providerUid?: number;
    frequency?: string;
  } | null {
    // Extract datasource ID
    const dsMatch = key.match(/\{ds:(\d+)\}/);
    if (!dsMatch?.[1]) {
      return null;
    }

    const datasourceId = Number.parseInt(dsMatch[1], 10);
    if (Number.isNaN(datasourceId)) {
      return null;
    }

    const result: {
      datasourceId: number;
      measure?: string;
      practiceUid?: number;
      providerUid?: number;
      frequency?: string;
    } = { datasourceId };

    // Extract components after the datasource prefix
    const prefixMatch = key.match(/^idx:\{ds:\d+\}:(.+)$/);
    if (!prefixMatch?.[1]) {
      return result; // Just datasource ID (e.g., master index)
    }

    const keyParts = prefixMatch[1];

    // Extract measure
    const measureMatch = keyParts.match(/m:([^:]+)/);
    if (measureMatch?.[1] && measureMatch[1] !== '*') {
      result.measure = measureMatch[1];
    }

    // Extract practice
    const practiceMatch = keyParts.match(/p:(\d+)/);
    if (practiceMatch?.[1]) {
      const practiceUid = Number.parseInt(practiceMatch[1], 10);
      if (!Number.isNaN(practiceUid)) {
        result.practiceUid = practiceUid;
      }
    }

    // Extract provider
    const providerMatch = keyParts.match(/prov:(\d+)/);
    if (providerMatch?.[1]) {
      const providerUid = Number.parseInt(providerMatch[1], 10);
      if (!Number.isNaN(providerUid)) {
        result.providerUid = providerUid;
      }
    }

    // Extract frequency
    const frequencyMatch = keyParts.match(/freq:([^:]+)/);
    if (frequencyMatch?.[1] && frequencyMatch[1] !== '*') {
      result.frequency = frequencyMatch[1];
    }

    return result;
  },
};
