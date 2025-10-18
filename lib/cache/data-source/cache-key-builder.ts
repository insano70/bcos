/**
 * Cache Key Builder for Data Source Cache
 *
 * Responsible for constructing and parsing cache keys following a consistent format.
 *
 * KEY FORMAT:
 * datasource:{ds_id}:m:{measure}:p:{practice_uid}:prov:{provider_uid}:freq:{frequency}
 *
 * WILDCARDS:
 * - Use '*' for optional components (measure, practice_uid, provider_uid, frequency)
 * - Enables hierarchical cache lookups and pattern-based invalidation
 *
 * EXAMPLES:
 * - Full key: datasource:1:m:Revenue:p:114:prov:501:freq:monthly
 * - With wildcards: datasource:1:m:Revenue:p:*:prov:*:freq:monthly
 * - Pattern for invalidation: datasource:1:m:Revenue:*
 */

export interface CacheKeyComponents {
  dataSourceId: number;
  measure?: string;
  practiceUid?: number;
  providerUid?: number;
  frequency?: string;
}

/**
 * Cache Key Builder
 * Pure utility class for cache key construction and parsing
 */
export class CacheKeyBuilder {
  private readonly WILDCARD = '*';
  private readonly NAMESPACE = 'datasource';

  /**
   * Build cache key from components
   * Format: datasource:{ds_id}:m:{measure}:p:{practice_uid}:prov:{provider_uid}:freq:{frequency}
   *
   * @param components - Key components
   * @returns Formatted cache key
   */
  buildKey(components: CacheKeyComponents): string {
    return [
      this.NAMESPACE,
      components.dataSourceId.toString(),
      'm',
      components.measure ?? this.WILDCARD,
      'p',
      components.practiceUid?.toString() ?? this.WILDCARD,
      'prov',
      components.providerUid?.toString() ?? this.WILDCARD,
      'freq',
      components.frequency ?? this.WILDCARD,
    ].join(':');
  }

  /**
   * Build pattern for cache invalidation
   * Uses wildcards for broader matching
   *
   * @param dataSourceId - Required data source ID
   * @param measure - Optional measure filter
   * @returns Pattern string for Redis pattern matching
   */
  buildPattern(dataSourceId?: number, measure?: string): string {
    if (!dataSourceId) {
      // All data sources
      return `${this.NAMESPACE}:*`;
    }

    if (measure) {
      // Specific data source + measure
      return `${this.NAMESPACE}:${dataSourceId}:m:${measure}:*`;
    }

    // Entire data source
    return `${this.NAMESPACE}:${dataSourceId}:*`;
  }

  /**
   * Parse cache key back into components
   * Useful for statistics and debugging
   *
   * @param key - Cache key to parse
   * @returns Parsed components or null if invalid format
   */
  parseKey(key: string): CacheKeyComponents | null {
    // Format: datasource:{id}:m:{measure}:p:{practice}:prov:{provider}:freq:{frequency}
    const parts = key.split(':');

    if (parts.length !== 10 || parts[0] !== this.NAMESPACE) {
      return null;
    }

    const dataSourceIdStr = parts[1];
    if (!dataSourceIdStr) {
      return null;
    }

    const dataSourceId = parseInt(dataSourceIdStr, 10);
    if (Number.isNaN(dataSourceId)) {
      return null;
    }

    const components: CacheKeyComponents = {
      dataSourceId,
    };

    const measurePart = parts[3];
    if (measurePart && measurePart !== this.WILDCARD) {
      components.measure = measurePart;
    }

    const practicePart = parts[5];
    if (practicePart && practicePart !== this.WILDCARD) {
      const practiceUid = parseInt(practicePart, 10);
      if (!Number.isNaN(practiceUid)) {
        components.practiceUid = practiceUid;
      }
    }

    const providerPart = parts[7];
    if (providerPart && providerPart !== this.WILDCARD) {
      const providerUid = parseInt(providerPart, 10);
      if (!Number.isNaN(providerUid)) {
        components.providerUid = providerUid;
      }
    }

    const frequencyPart = parts[9];
    if (frequencyPart && frequencyPart !== this.WILDCARD) {
      components.frequency = frequencyPart;
    }

    return components;
  }

  /**
   * Get namespace for this cache service
   */
  getNamespace(): string {
    return this.NAMESPACE;
  }
}

// Export singleton instance
export const cacheKeyBuilder = new CacheKeyBuilder();
