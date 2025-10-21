/**
 * Cache Key Generator
 *
 * Generates deterministic cache keys from chart configurations.
 * Part of Phase 6: Unified Caching Strategy
 *
 * Key Format: chart:data:{chartType}:{dataSourceId}:{chartDefinitionId}:{configHash}
 * Example: chart:data:dual-axis:3:abc-123-def:a1b2c3d4
 *
 * Features:
 * - Includes chartDefinitionId to prevent cache collision between different charts
 * - Deterministic hashing (same config = same key)
 * - Excludes UI-only properties (width, height, responsive)
 * - Handles complex nested objects
 * - Collision-resistant hashing
 */

import crypto from 'node:crypto';
import { log } from '@/lib/logger';

/**
 * Properties to exclude from cache key generation
 * These are UI-only and don't affect data
 */
const EXCLUDED_PROPERTIES = new Set([
  'width',
  'height',
  'responsive',
  'minHeight',
  'maxHeight',
  'aspectRatio',
  'className',
  'title', // Chart title doesn't affect data
  // NOTE: colorPalette is NOT excluded because colors are applied server-side
  // during data transformation in chart strategies (bar-chart-strategy.ts, etc.)
]);

/**
 * Generate deterministic cache key from chart configuration
 *
 * @param config - Chart configuration object
 * @returns Cache key string
 *
 * @example
 * ```typescript
 * const key = generateCacheKey({
 *   chartType: 'bar',
 *   dataSourceId: 42,
 *   chartDefinitionId: 'abc-123-def-456',
 *   groupBy: 'provider_name',
 *   startDate: '2024-01-01',
 *   endDate: '2024-12-31',
 * });
 * // Returns: "bar:42:abc-123-def-456:a1b2c3d4e5f6"
 * ```
 */
export function generateCacheKey(config: Record<string, unknown>): string {
  try {
    const chartType = (config.chartType as string) || 'unknown';
    const dataSourceId = (config.dataSourceId as number) || 0;
    const chartDefinitionId = (config.chartDefinitionId as string) || 'inline';

    // Extract cache-relevant properties (exclude UI-only props AND chartDefinitionId)
    const cacheRelevantConfig: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(config)) {
      // Exclude UI props and chartDefinitionId (since it's in the key itself)
      if (key !== 'chartDefinitionId' && !EXCLUDED_PROPERTIES.has(key) && value !== undefined && value !== null) {
        cacheRelevantConfig[key] = value;
      }
    }

    // Sort keys for deterministic JSON.stringify
    const sortedKeys = Object.keys(cacheRelevantConfig).sort();
    const sortedConfig: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      sortedConfig[key] = cacheRelevantConfig[key];
    }

    // Generate hash from sorted config
    const configString = JSON.stringify(sortedConfig);
    const hash = crypto.createHash('sha256').update(configString).digest('hex').substring(0, 12); // First 12 chars sufficient for uniqueness

    // Include chartDefinitionId in key to prevent collision between different charts
    const cacheKey = `${chartType}:${dataSourceId}:${chartDefinitionId}:${hash}`;

    log.debug('Cache key generated', {
      chartType,
      dataSourceId,
      chartDefinitionId,
      hash,
      cacheKey,
      configSize: configString.length,
    });

    return cacheKey;
  } catch (error) {
    log.error('Cache key generation failed', error, {
      chartType: config.chartType,
      dataSourceId: config.dataSourceId,
      chartDefinitionId: config.chartDefinitionId,
    });

    // Fallback: Generate key from timestamp (cache will be unique per request)
    const fallbackKey = `fallback:${Date.now()}:${Math.random().toString(36).substring(7)}`;
    log.warn('Using fallback cache key', { fallbackKey });
    return fallbackKey;
  }
}

/**
 * Generate cache key pattern for invalidation
 *
 * @param chartType - Chart type (optional, * for all types)
 * @param dataSourceId - Data source ID (optional, * for all sources)
 * @returns Pattern string for Redis KEYS command
 *
 * @example
 * ```typescript
 * // All bar charts
 * const pattern = generateCacheKeyPattern('bar');
 * // Returns: "bar:*:*"
 *
 * // All charts for data source 42
 * const pattern = generateCacheKeyPattern('*', 42);
 * // Returns: "*:42:*"
 *
 * // Specific bar charts for data source 42
 * const pattern = generateCacheKeyPattern('bar', 42);
 * // Returns: "bar:42:*"
 * ```
 */
export function generateCacheKeyPattern(chartType: string = '*', dataSourceId?: number): string {
  const typePattern = chartType || '*';
  const sourcePattern = dataSourceId !== undefined ? dataSourceId.toString() : '*';

  return `${typePattern}:${sourcePattern}:*`;
}

/**
 * Validate cache key format
 *
 * @param key - Cache key to validate
 * @returns true if valid format
 */
export function isValidCacheKey(key: string): boolean {
  // Expected format: {chartType}:{dataSourceId}:{hash}
  const parts = key.split(':');

  if (parts.length !== 3) {
    return false;
  }

  const [chartType, dataSourceId, hash] = parts;

  // Basic validation
  if (!chartType || chartType.length === 0) return false;
  if (!dataSourceId || Number.isNaN(Number(dataSourceId))) return false;
  if (!hash || hash.length < 8) return false;

  return true;
}
