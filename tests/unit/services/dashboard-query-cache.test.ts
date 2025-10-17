/**
 * Dashboard Query Cache Unit Tests
 *
 * Phase 7: Query Deduplication
 *
 * Tests the query hash generation and caching logic for dashboard query deduplication.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { DashboardQueryCache, generateQueryHash } from '@/lib/services/dashboard-query-cache';

describe('generateQueryHash', () => {
  describe('Deterministic Hashing', () => {
    it('should generate identical hashes for identical configurations', () => {
      const config = {
        dataSourceId: 1,
        chartType: 'line',
        colorPalette: 'default',
      };

      const runtimeFilters = {
        measure: 'total_charges',
        frequency: 'monthly',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      };

      const hash1 = generateQueryHash(config, runtimeFilters);
      const hash2 = generateQueryHash(config, runtimeFilters);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 produces 64 hex characters
    });

    it('should generate identical hashes regardless of parameter order', () => {
      const config = {
        dataSourceId: 1,
        chartType: 'line',
      };

      const filters1 = {
        measure: 'total_charges',
        frequency: 'monthly',
        startDate: '2024-01-01',
      };

      const filters2 = {
        startDate: '2024-01-01',
        measure: 'total_charges',
        frequency: 'monthly',
      };

      const hash1 = generateQueryHash(config, filters1);
      const hash2 = generateQueryHash(config, filters2);

      expect(hash1).toBe(hash2);
    });
  });

  describe('Query-Affecting Parameters', () => {
    it('should generate different hashes for different measures', () => {
      const config = { dataSourceId: 1, chartType: 'line' };

      const hash1 = generateQueryHash(config, { measure: 'total_charges' });
      const hash2 = generateQueryHash(config, { measure: 'total_payments' });

      expect(hash1).not.toBe(hash2);
    });

    it('should generate different hashes for different frequencies', () => {
      const config = { dataSourceId: 1, chartType: 'line' };

      const hash1 = generateQueryHash(config, { frequency: 'monthly' });
      const hash2 = generateQueryHash(config, { frequency: 'weekly' });

      expect(hash1).not.toBe(hash2);
    });

    it('should generate different hashes for different date ranges', () => {
      const config = { dataSourceId: 1, chartType: 'line' };

      const hash1 = generateQueryHash(config, {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      });
      const hash2 = generateQueryHash(config, {
        startDate: '2024-01-01',
        endDate: '2024-06-30',
      });

      expect(hash1).not.toBe(hash2);
    });

    it('should generate different hashes for different practice UIDs', () => {
      const config = { dataSourceId: 1, chartType: 'line' };

      const hash1 = generateQueryHash(config, { practiceUids: [1, 2, 3] });
      const hash2 = generateQueryHash(config, { practiceUids: [4, 5, 6] });

      expect(hash1).not.toBe(hash2);
    });

    it('should generate different hashes for different data sources', () => {
      const hash1 = generateQueryHash(
        { dataSourceId: 1, chartType: 'line' },
        { measure: 'total_charges' }
      );
      const hash2 = generateQueryHash(
        { dataSourceId: 2, chartType: 'line' },
        { measure: 'total_charges' }
      );

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Transformation-Only Parameters', () => {
    it('should generate identical hashes for different chart types', () => {
      const runtimeFilters = {
        measure: 'total_charges',
        frequency: 'monthly',
      };

      const hash1 = generateQueryHash({ dataSourceId: 1, chartType: 'line' }, runtimeFilters);
      const hash2 = generateQueryHash({ dataSourceId: 1, chartType: 'bar' }, runtimeFilters);
      const hash3 = generateQueryHash({ dataSourceId: 1, chartType: 'area' }, runtimeFilters);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('should generate identical hashes for different color palettes', () => {
      const runtimeFilters = { measure: 'total_charges' };

      const hash1 = generateQueryHash(
        { dataSourceId: 1, chartType: 'line', colorPalette: 'default' },
        runtimeFilters
      );
      const hash2 = generateQueryHash(
        { dataSourceId: 1, chartType: 'line', colorPalette: 'vibrant' },
        runtimeFilters
      );

      expect(hash1).toBe(hash2);
    });

    it('should generate identical hashes for different stacking modes', () => {
      const runtimeFilters = { measure: 'total_charges' };

      const hash1 = generateQueryHash(
        { dataSourceId: 1, chartType: 'bar', stackingMode: 'normal' },
        runtimeFilters
      );
      const hash2 = generateQueryHash(
        { dataSourceId: 1, chartType: 'bar', stackingMode: 'percentage' },
        runtimeFilters
      );

      expect(hash1).toBe(hash2);
    });

    it('should generate identical hashes regardless of groupBy (transformation-only)', () => {
      const runtimeFilters = { measure: 'total_charges' };

      const hash1 = generateQueryHash(
        { dataSourceId: 1, chartType: 'bar', groupBy: 'provider_name' },
        runtimeFilters
      );
      const hash2 = generateQueryHash(
        { dataSourceId: 1, chartType: 'bar', groupBy: 'practice_name' },
        runtimeFilters
      );
      const hash3 = generateQueryHash(
        { dataSourceId: 1, chartType: 'bar' }, // No groupBy
        runtimeFilters
      );

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined/null values gracefully', () => {
      const config = { dataSourceId: 1, chartType: 'line' };

      const hash1 = generateQueryHash(config, { measure: 'total_charges' });
      const hash2 = generateQueryHash(config, {
        measure: 'total_charges',
        frequency: undefined,
        startDate: null,
      });

      expect(hash1).toBe(hash2);
    });

    it('should handle empty arrays', () => {
      const config = { dataSourceId: 1, chartType: 'line' };

      const hash1 = generateQueryHash(config, { practiceUids: [] });
      const hash2 = generateQueryHash(config, { practiceUids: undefined });

      expect(hash1).toBe(hash2);
    });

    it('should handle complex advanced filters', () => {
      const config = { dataSourceId: 1, chartType: 'line' };

      const filters = {
        measure: 'total_charges',
        advancedFilters: [
          { field: 'provider_type', operator: 'eq', value: 'physician' },
          { field: 'payment_status', operator: 'in', value: ['paid', 'pending'] },
        ],
      };

      const hash1 = generateQueryHash(config, filters);
      const hash2 = generateQueryHash(config, filters);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });
  });
});

describe('DashboardQueryCache', () => {
  let cache: DashboardQueryCache;

  beforeEach(() => {
    cache = new DashboardQueryCache();
  });

  describe('Promise Caching', () => {
    it('should execute query only once for multiple requests with same hash', async () => {
      let executionCount = 0;

      const executor = async () => {
        executionCount++;
        return [{ data: 'test' }];
      };

      const queryHash = 'test-hash-123';

      // Execute 3 parallel requests with same hash
      const [result1, result2, result3] = await Promise.all([
        cache.get(queryHash, executor),
        cache.get(queryHash, executor),
        cache.get(queryHash, executor),
      ]);

      expect(executionCount).toBe(1); // Only executed once
      expect(result1).toEqual([{ data: 'test' }]);
      expect(result2).toEqual([{ data: 'test' }]);
      expect(result3).toEqual([{ data: 'test' }]);
    });

    it('should execute queries for different hashes', async () => {
      let execution1Count = 0;
      let execution2Count = 0;

      const executor1 = async () => {
        execution1Count++;
        return [{ data: 'query1' }];
      };

      const executor2 = async () => {
        execution2Count++;
        return [{ data: 'query2' }];
      };

      const result1 = await cache.get('hash-1', executor1);
      const result2 = await cache.get('hash-2', executor2);

      expect(execution1Count).toBe(1);
      expect(execution2Count).toBe(1);
      expect(result1).toEqual([{ data: 'query1' }]);
      expect(result2).toEqual([{ data: 'query2' }]);
    });

    it('should handle errors in executor', async () => {
      const executor = async () => {
        throw new Error('Query failed');
      };

      await expect(cache.get('error-hash', executor)).rejects.toThrow('Query failed');
    });
  });

  describe('Statistics Tracking', () => {
    it('should track cache hits and misses', async () => {
      const executor = async () => [{ data: 'test' }];

      // First request - miss
      await cache.get('hash-1', executor);

      // Second request same hash - hit
      await cache.get('hash-1', executor);

      // Third request same hash - hit
      await cache.get('hash-1', executor);

      // Fourth request different hash - miss
      await cache.get('hash-2', executor);

      const stats = cache.getStats();

      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
      expect(stats.uniqueQueries).toBe(2);
      expect(stats.totalRequests).toBe(4);
      expect(stats.deduplicationRate).toBe(50); // 2/4 = 50%
    });

    it('should calculate deduplication rate correctly', async () => {
      const executor = async () => [{ data: 'test' }];

      // Execute same query 5 times
      for (let i = 0; i < 5; i++) {
        await cache.get('same-hash', executor);
      }

      const stats = cache.getStats();

      expect(stats.uniqueQueries).toBe(1);
      expect(stats.hits).toBe(4);
      expect(stats.misses).toBe(1);
      expect(stats.deduplicationRate).toBe(80); // 4/5 = 80%
    });

    it('should handle zero requests correctly', () => {
      const stats = cache.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.uniqueQueries).toBe(0);
      expect(stats.totalRequests).toBe(0);
      expect(stats.deduplicationRate).toBe(0);
    });
  });

  describe('Cache Management', () => {
    it('should clear cache and reset statistics', async () => {
      const executor = async () => [{ data: 'test' }];

      await cache.get('hash-1', executor);
      await cache.get('hash-1', executor);

      expect(cache.size()).toBe(1);
      expect(cache.getStats().hits).toBe(1);

      cache.clear();

      expect(cache.size()).toBe(0);
      expect(cache.getStats().hits).toBe(0);
      expect(cache.getStats().misses).toBe(0);
      expect(cache.getStats().uniqueQueries).toBe(0);
    });

    it('should allow reuse after clear', async () => {
      const executor = async () => [{ data: 'test' }];

      await cache.get('hash-1', executor);
      cache.clear();

      let executionCount = 0;
      const newExecutor = async () => {
        executionCount++;
        return [{ data: 'new' }];
      };

      await cache.get('hash-1', newExecutor);

      expect(executionCount).toBe(1); // Executed after clear
      expect(cache.getStats().misses).toBe(1);
    });
  });

  describe('Concurrent Access', () => {
    it('should handle concurrent requests for same hash', async () => {
      let executionCount = 0;
      let isExecuting = false;

      const executor = async () => {
        if (isExecuting) {
          throw new Error('Concurrent execution detected');
        }

        isExecuting = true;
        executionCount++;

        // Simulate async delay
        await new Promise((resolve) => setTimeout(resolve, 10));

        isExecuting = false;
        return [{ data: `result-${executionCount}` }];
      };

      // Fire off 10 concurrent requests
      const promises = Array.from({ length: 10 }, () => cache.get('concurrent-hash', executor));

      const results = await Promise.all(promises);

      expect(executionCount).toBe(1); // Only executed once
      results.forEach((result) => {
        expect(result).toEqual([{ data: 'result-1' }]);
      });
    });
  });
});
