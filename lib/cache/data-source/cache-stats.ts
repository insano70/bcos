/**
 * Cache Statistics Service
 *
 * Provides cache statistics and monitoring for data source cache.
 *
 * RESPONSIBILITIES:
 * - Aggregate cache statistics
 * - Per-data-source breakdowns
 * - Memory usage calculations
 * - Largest entry identification
 * - Key distribution analysis
 *
 * ARCHITECTURE:
 * - Read-only operations (no side effects)
 * - Scans Redis keys for analysis
 * - Parses cache keys for metadata
 */

import { log } from '@/lib/logger';
import { getRedisClient } from '@/lib/redis';
import { cacheKeyBuilder } from './cache-key-builder';

/**
 * Cached data entry structure (for parsing)
 */
interface CachedDataEntry {
  rows: Record<string, unknown>[];
  rowCount: number;
  cachedAt: string;
  expiresAt: string;
  sizeBytes: number;
}

/**
 * Cache statistics result
 */
export interface CacheStatsResult {
  totalKeys: number;
  totalMemoryMB: number;
  totalMemoryGB: number; // Added for large caches
  cacheKeys: string[];
  keysByLevel: Record<string, number>;
  keysByType: {
    // Added for type breakdown
    'measure-based': number;
    'table-based': number;
  };
  byDataSource: Record<
    number,
    {
      keys: number;
      memoryMB: number;
      memoryGB: number; // Added for large caches
      measures: string[];
      dataSourceType?: 'measure-based' | 'table-based'; // Added for type info
    }
  >;
  largestEntries: Array<{
    key: string;
    sizeMB: number;
    sizeGB: number; // Added for large caches
    rowCount?: number;
  }>;
}

/**
 * Cache Statistics Service
 * Provides monitoring and analysis of cache contents
 */
export class CacheStatsService {
  private readonly SCAN_COUNT = 10000;
  private readonly MAX_SCAN_ITERATIONS = 10000; // Safety limit to prevent infinite loops

  /**
   * Get enhanced cache statistics
   * Includes per-data-source breakdown, hit rates, and largest entries
   *
   * @returns Cache statistics
   */
  async getStats(): Promise<CacheStatsResult> {
    const client = getRedisClient();
    if (!client) {
      return {
        totalKeys: 0,
        totalMemoryMB: 0,
        totalMemoryGB: 0,
        cacheKeys: [],
        keysByLevel: {},
        keysByType: {
          'measure-based': 0,
          'table-based': 0,
        },
        byDataSource: {},
        largestEntries: [],
      };
    }

    // Scan for all data source cache keys
    const pattern = `${cacheKeyBuilder.getNamespace()}:*`;
    const keys: string[] = [];
    let cursor = '0';
    let iterations = 0;

    try {
      do {
        if (iterations++ >= this.MAX_SCAN_ITERATIONS) {
          log.error('SCAN operation exceeded max iterations - Redis may be unhealthy', {
            pattern,
            iterations,
            keysFound: keys.length,
            operation: 'getStats',
          });
          break;
        }

        const [newCursor, foundKeys] = await client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          this.SCAN_COUNT
        );
        cursor = newCursor;
        keys.push(...foundKeys);
      } while (cursor !== '0');
    } catch (error) {
      log.error('Failed to scan cache keys', error instanceof Error ? error : new Error(String(error)), {
        operation: 'getStats',
        pattern,
      });
      return {
        totalKeys: 0,
        totalMemoryMB: 0,
        totalMemoryGB: 0,
        cacheKeys: [],
        keysByLevel: {},
        keysByType: {
          'measure-based': 0,
          'table-based': 0,
        },
        byDataSource: {},
        largestEntries: [],
      };
    }

    if (keys.length === 0) {
      return {
        totalKeys: 0,
        totalMemoryMB: 0,
        totalMemoryGB: 0,
        cacheKeys: [],
        keysByLevel: {},
        keysByType: {
          'measure-based': 0,
          'table-based': 0,
        },
        byDataSource: {},
        largestEntries: [],
      };
    }

    let totalSize = 0;
    const keysByLevel: Record<string, number> = {
      'Level 0 (Full DS)': 0,
      'Level 1 (Measure)': 0,
      'Level 2 (Measure+Practice)': 0,
      'Level 3 (Measure+Practice+Freq)': 0,
      'Level 4 (Full)': 0,
    };
    const keysByType = {
      'measure-based': 0,
      'table-based': 0,
    };
    const byDataSource: Record<
      number,
      { keys: number; memoryMB: number; measures: Set<string>; dataSourceType?: 'measure-based' | 'table-based' }
    > = {};
    const entrySizes: Array<{ key: string; size: number; rowCount?: number }> = [];

    for (const key of keys) {
      try {
        const value = await client.get(key);
        if (value) {
          const size = Buffer.byteLength(value, 'utf8');
          totalSize += size;

          // Parse key to extract data source ID and type
          // Formats:
          // - Measure-based: datasource:{id}:m:{measure}:p:{practice}:prov:{provider}:freq:{frequency}
          // - Table-based: datasource:{id}:table:p:{practice}:prov:{provider}
          const match = key.match(/^datasource:(\d+):(\w+):/);
          if (match?.[1] && match?.[2]) {
            const dataSourceId = parseInt(match[1], 10);
            const typeIndicator = match[2];
            const dataSourceType: 'measure-based' | 'table-based' =
              typeIndicator === 'table' ? 'table-based' : 'measure-based';

            // Track by type
            keysByType[dataSourceType]++;

            if (!byDataSource[dataSourceId]) {
              byDataSource[dataSourceId] = {
                keys: 0,
                memoryMB: 0,
                measures: new Set<string>(),
                dataSourceType,
              };
            }
            const dsStats = byDataSource[dataSourceId];
            if (dsStats) {
              dsStats.keys++;
              dsStats.memoryMB += size / 1024 / 1024;
              dsStats.dataSourceType = dataSourceType;

              // Extract measure name (measure-based only)
              if (dataSourceType === 'measure-based') {
                const measureMatch = key.match(/:m:([^:]+):/);
                if (measureMatch?.[1] && measureMatch[1] !== '*') {
                  dsStats.measures.add(measureMatch[1]);
                }
              }
            }
          }

          // Count wildcards to determine level
          const wildcards = (key.match(/\*/g) || []).length;
          if (wildcards === 4) {
            keysByLevel['Level 0 (Full DS)'] = (keysByLevel['Level 0 (Full DS)'] || 0) + 1;
          } else if (wildcards === 3) {
            keysByLevel['Level 1 (Measure)'] = (keysByLevel['Level 1 (Measure)'] || 0) + 1;
          } else if (wildcards === 2) {
            keysByLevel['Level 2 (Measure+Practice)'] =
              (keysByLevel['Level 2 (Measure+Practice)'] || 0) + 1;
          } else if (wildcards === 1) {
            keysByLevel['Level 3 (Measure+Practice+Freq)'] =
              (keysByLevel['Level 3 (Measure+Practice+Freq)'] || 0) + 1;
          } else {
            keysByLevel['Level 4 (Full)'] = (keysByLevel['Level 4 (Full)'] || 0) + 1;
          }

          // Track entry sizes for largest entries
          try {
            const parsed = JSON.parse(value) as CachedDataEntry;
            entrySizes.push({
              key,
              size,
              rowCount: parsed.rowCount,
            });
          } catch {
            entrySizes.push({ key, size });
          }
        }
      } catch (error) {
        log.warn('Failed to process cache key', {
          key,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Get top 10 largest entries
    const largestEntries = entrySizes
      .sort((a, b) => b.size - a.size)
      .slice(0, 10)
      .map((entry) => {
        const sizeMB = entry.size / 1024 / 1024;
        const sizeGB = entry.size / (1024 * 1024 * 1024);
        return {
          key: entry.key,
          sizeMB: Math.round(sizeMB * 100) / 100,
          sizeGB: Math.round(sizeGB * 100) / 100,
          ...(entry.rowCount !== undefined && { rowCount: entry.rowCount }),
        };
      });

    // Convert byDataSource to final format (Set → Array)
    const byDataSourceFinal: Record<
      number,
      {
        keys: number;
        memoryMB: number;
        memoryGB: number;
        measures: string[];
        dataSourceType?: 'measure-based' | 'table-based';
      }
    > = {};
    for (const [dataSourceId, stats] of Object.entries(byDataSource)) {
      const memoryMB = stats.memoryMB;
      const memoryGB = stats.memoryMB / 1024;
      byDataSourceFinal[parseInt(dataSourceId, 10)] = {
        keys: stats.keys,
        memoryMB: Math.round(memoryMB * 100) / 100,
        memoryGB: Math.round(memoryGB * 100) / 100,
        measures: Array.from(stats.measures).sort(),
        dataSourceType: stats.dataSourceType,
      };
    }

    const totalMemoryMB = totalSize / 1024 / 1024;
    const totalMemoryGB = totalSize / (1024 * 1024 * 1024);

    return {
      totalKeys: keys.length,
      totalMemoryMB: Math.round(totalMemoryMB * 100) / 100,
      totalMemoryGB: Math.round(totalMemoryGB * 100) / 100,
      cacheKeys: keys,
      keysByLevel,
      keysByType,
      byDataSource: byDataSourceFinal,
      largestEntries,
    };
  }
}

// Export singleton instance
export const cacheStatsService = new CacheStatsService();
