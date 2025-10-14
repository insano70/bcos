/**
 * Slow Queries API
 *
 * GET /api/admin/monitoring/slow-queries
 *
 * Returns database queries that exceeded the slow threshold (500ms).
 * Queries CloudWatch Logs for slow database operations.
 *
 * Query Parameters:
 * - limit: Maximum results (default: 50, max: 500)
 * - timeRange: Time range ('1h', '6h', '24h', '7d')
 * - threshold: Minimum duration in ms (default: 500)
 * - table: Filter by specific table
 *
 * RBAC: settings:read:all (Super Admin only)
 */

import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { log } from '@/lib/logger';
import type { SlowQueriesResponse, SlowQuery } from '@/lib/monitoring/types';

const slowQueriesHandler = async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 500);
    const timeRange = searchParams.get('timeRange') || '1h';
    const threshold = parseInt(searchParams.get('threshold') || '500', 10);
    // const tableFilter = searchParams.get('table');

    log.info('Slow queries request initiated', {
      operation: 'query_slow_queries',
      timeRange,
      threshold,
      limit,
      component: 'monitoring',
    });

    // TODO: Query CloudWatch Logs for slow queries
    // For now, return mock/empty data until CloudWatch SDK is configured
    const queries: SlowQuery[] = [];

    // Calculate summary
    const byTable: Record<string, { count: number; avgDuration: number }> = {};
    const byOperation: Record<string, number> = {};

    for (const query of queries) {
      // By table
      if (!byTable[query.table]) {
        byTable[query.table] = { count: 0, avgDuration: 0 };
      }
      const tableStats = byTable[query.table];
      if (tableStats) {
        tableStats.count++;
        tableStats.avgDuration =
          (tableStats.avgDuration * (tableStats.count - 1) + query.duration) /
          tableStats.count;
      }

      // By operation
      byOperation[query.operation] = (byOperation[query.operation] || 0) + 1;
    }

    const avgDuration =
      queries.length > 0
        ? queries.reduce((sum, q) => sum + q.duration, 0) / queries.length
        : 0;

    const response: SlowQueriesResponse = {
      queries,
      totalCount: queries.length,
      avgDuration: Math.round(avgDuration),
      slowThreshold: threshold,
      summary: {
        byTable,
        byOperation,
      },
    };

    const duration = Date.now() - startTime;

    log.info('Slow queries retrieved', {
      operation: 'query_slow_queries',
      duration,
      queryCount: queries.length,
      avgDuration: response.avgDuration,
      component: 'monitoring',
    });

    return createSuccessResponse(response);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error(
      'Failed to get slow queries',
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: 'query_slow_queries',
        duration,
        component: 'monitoring',
      }
    );

    // Return empty result on error
    const fallback: SlowQueriesResponse = {
      queries: [],
      totalCount: 0,
      avgDuration: 0,
      slowThreshold: 500,
      summary: { byTable: {}, byOperation: {} },
    };

    return createSuccessResponse(fallback);
  }
};

// Export with RBAC protection
export const GET = rbacRoute(slowQueriesHandler, {
  permission: 'settings:read:all',
  rateLimit: 'api',
});

