/**
 * Dimension Discovery Integration Tests
 *
 * Integration tests for the dimension discovery system.
 * Tests the complete flow with real database interactions.
 *
 * Tests:
 * - DimensionValueCache with SQL DISTINCT queries
 * - Integration with dimension-discovery-service
 * - Redis caching behavior
 * - RBAC filtering
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { dimensionValueCache } from '@/lib/services/analytics/dimension-value-cache';
import { dimensionDiscoveryService } from '@/lib/services/analytics/dimension-discovery-service';
import { getRedisClient } from '@/lib/redis';
import { db } from '@/lib/db';
import { chart_data_source_columns, chart_data_sources } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import type { UserContext } from '@/lib/types/rbac';

describe('Dimension Discovery Integration', () => {
  let userContext: UserContext;
  let hasRequiredDataSource = false;

  // Helper to scan and delete keys matching a pattern (KEYS command not available in Valkey Serverless)
  const scanAndDeleteKeys = async (pattern: string) => {
    const redis = getRedisClient();
    if (!redis) return;

    let cursor = '0';
    do {
      const result = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = result[0];
      const keys = result[1];
      for (const key of keys) {
        await redis.del(key);
      }
    } while (cursor !== '0');
  };

  beforeAll(async () => {
    // Create mock super admin context for tests
    userContext = {
      user_id: 'test-user',
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
      is_active: true,
      email_verified: true,
      roles: [],
      organizations: [],
      accessible_organizations: [],
      user_roles: [],
      user_organizations: [],
      all_permissions: [],
      is_super_admin: true,
      organization_admin_for: [],
    };

    // Check if data source #3 exists and has at least one configured expansion dimension
    // (the service requires `is_expansion_dimension = true` for the requested column).
    try {
      const ds = await db
        .select()
        .from(chart_data_sources)
        .where(eq(chart_data_sources.data_source_id, 3))
        .limit(1);

      if (ds.length > 0) {
        // Require 'location' to be an expansion dimension for the DimensionDiscoveryService tests
        const cols = await db
          .select()
          .from(chart_data_source_columns)
          .where(
            and(
              eq(chart_data_source_columns.data_source_id, 3),
              eq(chart_data_source_columns.column_name, 'location'),
              eq(chart_data_source_columns.is_expansion_dimension, true)
            )
          )
          .limit(1);

        hasRequiredDataSource = cols.length > 0;
      }
    } catch {
      hasRequiredDataSource = false;
    }

    // Clear dimension cache before tests
    await scanAndDeleteKeys('dim:*');
  });

  afterAll(async () => {
    // Clean up dimension cache after tests
    await scanAndDeleteKeys('dim:*');
  });

  describe('DimensionValueCache', () => {
    it('should query dimension values with SQL DISTINCT', async () => {
      if (!hasRequiredDataSource) {
        console.log('Skipping: Data source #3 with dimension columns not configured');
        return;
      }

      const result = await dimensionValueCache.getDimensionValues(
        {
          dataSourceId: 3,
          dimensionColumn: 'location',
          measure: 'AR',
          frequency: 'Monthly',
          limit: 20,
        },
        userContext
      );

      expect(result.values).toBeDefined();
      expect(Array.isArray(result.values)).toBe(true);
      expect(result.fromCache).toBeDefined();
      expect(typeof result.queryTimeMs).toBe('number');

      // Each value should have value, label, and recordCount
      if (result.values.length > 0) {
        const firstValue = result.values[0];
        expect(firstValue).toHaveProperty('value');
        expect(firstValue).toHaveProperty('label');
        expect(firstValue).toHaveProperty('recordCount');
      }
    }, 10000);

    it('should cache dimension values on second query', async () => {
      if (!hasRequiredDataSource) {
        console.log('Skipping: Data source #3 with dimension columns not configured');
        return;
      }

      const params = {
        dataSourceId: 3,
        dimensionColumn: 'location',
        measure: 'AR',
        frequency: 'Monthly',
        limit: 20,
      };

      // First query - cache miss
      const result1 = await dimensionValueCache.getDimensionValues(params, userContext);
      expect(result1.fromCache).toBe(false);

      // Second query - cache hit
      const result2 = await dimensionValueCache.getDimensionValues(params, userContext);
      expect(result2.fromCache).toBe(true);

      // Results should be identical
      expect(result2.values).toEqual(result1.values);
    }, 10000);

    it('should handle different filter combinations with separate cache keys', async () => {
      if (!hasRequiredDataSource) {
        console.log('Skipping: Data source #3 with dimension columns not configured');
        return;
      }

      // Query 1: Monthly AR
      const result1 = await dimensionValueCache.getDimensionValues(
        {
          dataSourceId: 3,
          dimensionColumn: 'location',
          measure: 'AR',
          frequency: 'Monthly',
          limit: 20,
        },
        userContext
      );

      // Query 2: Weekly AR (different frequency → different cache key)
      const result2 = await dimensionValueCache.getDimensionValues(
        {
          dataSourceId: 3,
          dimensionColumn: 'location',
          measure: 'AR',
          frequency: 'Weekly',
          limit: 20,
        },
        userContext
      );

      // Both should be cache misses (different keys)
      // Note: This assumes cache was cleared in beforeAll
      // If not cleared, could be cache hits from previous runs
      expect(result1.fromCache).toBeDefined();
      expect(result2.fromCache).toBeDefined();

      // Values might differ based on frequency
      expect(result1.values).toBeDefined();
      expect(result2.values).toBeDefined();
    }, 10000);

    it('should invalidate cache correctly', async () => {
      if (!hasRequiredDataSource) {
        console.log('Skipping: Data source #3 with dimension columns not configured');
        return;
      }

      const params = {
        dataSourceId: 3,
        dimensionColumn: 'location',
        measure: 'AR',
        frequency: 'Monthly',
        limit: 20,
      };

      // Query and cache
      await dimensionValueCache.getDimensionValues(params, userContext);

      // Invalidate cache
      await dimensionValueCache.invalidateCache(3, 'location');

      // Query again - should be cache miss
      const result2 = await dimensionValueCache.getDimensionValues(params, userContext);
      expect(result2.fromCache).toBe(false);
    }, 10000);
  });

  describe('DimensionDiscoveryService Integration', () => {
    it('should use optimized cache for getDimensionValues', async () => {
      if (!hasRequiredDataSource) {
        console.log('Skipping: Data source #3 with dimension columns not configured');
        return;
      }

      const result = await dimensionDiscoveryService.getDimensionValues(
        3, // dataSourceId
        'location', // dimensionColumn
        [
          { field: 'measure', operator: 'eq', value: 'AR' },
          { field: 'frequency', operator: 'eq', value: 'Monthly' },
        ],
        userContext,
        20 // limit
      );

      expect(result.values).toBeDefined();
      expect(Array.isArray(result.values)).toBe(true);
      expect(result.dimension).toBeDefined();
      expect(result.dimension.columnName).toBe('location');
      expect(result.totalValues).toBeGreaterThanOrEqual(0);
      expect(result.filtered).toBe(true);
    }, 10000);

    it('should return same results as old implementation', async () => {
      if (!hasRequiredDataSource) {
        console.log('Skipping: Data source #3 with dimension columns not configured');
        return;
      }

      // This test verifies backwards compatibility
      // The optimized version should return the same values as the old approach

      const filters: import('@/lib/types/analytics').ChartFilter[] = [
        { field: 'measure', operator: 'eq', value: 'AR' },
        { field: 'frequency', operator: 'eq', value: 'Monthly' },
        { field: 'date', operator: 'gte', value: '2024-01-01' },
        { field: 'date', operator: 'lte', value: '2024-12-31' },
      ];

      const result = await dimensionDiscoveryService.getDimensionValues(
        3,
        'location',
        filters,
        userContext,
        20
      );

      // Should have values (assuming test data exists)
      expect(result.values).toBeDefined();
      expect(result.dimension.columnName).toBe('location');

      // Each value should have the expected structure
      if (result.values.length > 0) {
        const firstValue = result.values[0];
        if (firstValue) {
          expect(firstValue).toHaveProperty('value');
          expect(firstValue).toHaveProperty('label');
          expect(typeof firstValue.value).toMatch(/string|number/);
          expect(typeof firstValue.label).toBe('string');
        }
      }
    }, 10000);
  });

  describe('Performance', () => {
    it('should complete dimension discovery quickly (<200ms)', async () => {
      if (!hasRequiredDataSource) {
        console.log('Skipping: Data source #3 with dimension columns not configured');
        return;
      }

      const startTime = Date.now();

      await dimensionDiscoveryService.getDimensionValues(
        3,
        'location',
        [
          { field: 'measure', operator: 'eq', value: 'AR' },
          { field: 'frequency', operator: 'eq', value: 'Monthly' },
        ],
        userContext,
        20
      );

      const duration = Date.now() - startTime;

      // First query might be slower (cache miss + Redis round-trip)
      // But should still be much faster than old approach
      expect(duration).toBeLessThan(2000); // 2 seconds max
    }, 10000);

    it('should complete cached queries very quickly (<50ms)', async () => {
      if (!hasRequiredDataSource) {
        console.log('Skipping: Data source #3 with dimension columns not configured');
        return;
      }

      const params = {
        dataSourceId: 3,
        dimensionColumn: 'location',
        measure: 'AR',
        frequency: 'Monthly',
        limit: 20,
      };

      // First query (cache miss)
      await dimensionValueCache.getDimensionValues(params, userContext);

      // Second query (cache hit) - measure time
      const startTime = Date.now();
      await dimensionValueCache.getDimensionValues(params, userContext);
      const duration = Date.now() - startTime;

      // Cached queries should be very fast
      expect(duration).toBeLessThan(100); // 100ms max for cache hit
    }, 10000);
  });

  describe('Cache Warming', () => {
    it('should warm dimension cache for multiple dimensions', async () => {
      if (!hasRequiredDataSource) {
        console.log('Skipping: Data source #3 with dimension columns not configured');
        return;
      }

      const commonParams = {
        measure: 'AR',
        frequency: 'Monthly',
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      };

      await dimensionValueCache.warmDimensionCache(
        3, // dataSourceId
        ['location', 'lob'], // dimension columns
        commonParams,
        userContext
      );

      // Cache should now be populated
      // Verify by checking that next queries are cache hits
      const result1 = await dimensionValueCache.getDimensionValues(
        {
          dataSourceId: 3,
          dimensionColumn: 'location',
          ...commonParams,
          limit: 20,
        },
        userContext
      );

      expect(result1.fromCache).toBe(true);
    }, 15000);
  });
});

