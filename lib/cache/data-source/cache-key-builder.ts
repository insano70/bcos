/**
 * Cache Key Builder for Data Source Cache
 *
 * Responsible for constructing and parsing cache keys following a consistent format.
 *
 * KEY FORMATS:
 * - Measure-based: datasource:{ds_id}:m:{measure}:p:{practice_uid}:prov:{provider_uid}:freq:{frequency}
 * - Table-based: datasource:{ds_id}:table:p:{practice_uid}:prov:{provider_uid}
 *
 * WILDCARDS:
 * - Use '*' for optional components (measure, practice_uid, provider_uid, frequency)
 * - Enables hierarchical cache lookups and pattern-based invalidation
 *
 * EXAMPLES:
 * - Measure-based full: datasource:1:m:Revenue:p:114:prov:501:freq:monthly
 * - Measure-based wildcards: datasource:1:m:Revenue:p:*:prov:*:freq:monthly
 * - Table-based full: datasource:388:table:p:123:prov:*
 * - Table-based no filters: datasource:388:table:p:*:prov:*
 * - Pattern for invalidation: datasource:1:m:Revenue:*
 */

export interface CacheKeyComponents {
  dataSourceId: number;
  dataSourceType?: 'measure-based' | 'table-based';
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
   *
   * Formats:
   * - Measure-based: datasource:{ds_id}:m:{measure}:p:{practice_uid}:prov:{provider_uid}:freq:{frequency}
   * - Table-based: datasource:{ds_id}:table:p:{practice_uid}:prov:{provider_uid}
   *
   * @param components - Key components
   * @returns Formatted cache key
   */
  buildKey(components: CacheKeyComponents): string {
    const dataSourceType = components.dataSourceType ?? 'measure-based';

    if (dataSourceType === 'table-based') {
      // Table-based format: no measure or frequency
      return [
        this.NAMESPACE,
        components.dataSourceId.toString(),
        'table',
        'p',
        components.practiceUid?.toString() ?? this.WILDCARD,
        'prov',
        components.providerUid?.toString() ?? this.WILDCARD,
      ].join(':');
    }

    // Measure-based format: traditional structure
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
   * @param measure - Optional measure filter (measure-based only)
   * @param dataSourceType - Optional type filter
   * @returns Pattern string for Redis pattern matching
   */
  buildPattern(
    dataSourceId?: number,
    measure?: string,
    dataSourceType?: 'measure-based' | 'table-based'
  ): string {
    if (!dataSourceId) {
      // All data sources
      return `${this.NAMESPACE}:*`;
    }

    // Type-specific patterns
    if (dataSourceType === 'table-based') {
      // All table-based entries for this data source
      return `${this.NAMESPACE}:${dataSourceId}:table:*`;
    }

    if (dataSourceType === 'measure-based') {
      if (measure) {
        // Specific measure in measure-based source
        return `${this.NAMESPACE}:${dataSourceId}:m:${measure}:*`;
      }
      // All measure-based entries for this data source
      return `${this.NAMESPACE}:${dataSourceId}:m:*`;
    }

    // No type specified - match both types
    if (measure) {
      // Specific data source + measure (measure-based only)
      return `${this.NAMESPACE}:${dataSourceId}:m:${measure}:*`;
    }

    // Entire data source (both types)
    return `${this.NAMESPACE}:${dataSourceId}:*`;
  }

  /**
   * Parse cache key back into components
   * Useful for statistics and debugging
   *
   * Handles both formats:
   * - Measure-based: datasource:{id}:m:{measure}:p:{practice}:prov:{provider}:freq:{frequency} (10 parts)
   * - Table-based: datasource:{id}:table:p:{practice}:prov:{provider} (7 parts)
   *
   * @param key - Cache key to parse
   * @returns Parsed components or null if invalid format
   */
  parseKey(key: string): CacheKeyComponents | null {
    const parts = key.split(':');

    if (parts[0] !== this.NAMESPACE) {
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

    const typeIndicator = parts[2];

    // Table-based format: datasource:{id}:table:p:{practice}:prov:{provider}
    if (typeIndicator === 'table') {
      if (parts.length !== 7) {
        return null;
      }

      const components: CacheKeyComponents = {
        dataSourceId,
        dataSourceType: 'table-based',
      };

      const practicePart = parts[4];
      if (practicePart && practicePart !== this.WILDCARD) {
        const practiceUid = parseInt(practicePart, 10);
        if (!Number.isNaN(practiceUid)) {
          components.practiceUid = practiceUid;
        }
      }

      const providerPart = parts[6];
      if (providerPart && providerPart !== this.WILDCARD) {
        const providerUid = parseInt(providerPart, 10);
        if (!Number.isNaN(providerUid)) {
          components.providerUid = providerUid;
        }
      }

      return components;
    }

    // Measure-based format: datasource:{id}:m:{measure}:p:{practice}:prov:{provider}:freq:{frequency}
    if (typeIndicator === 'm') {
      if (parts.length !== 10) {
        return null;
      }

      const components: CacheKeyComponents = {
        dataSourceId,
        dataSourceType: 'measure-based',
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

    // Invalid type indicator
    return null;
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
