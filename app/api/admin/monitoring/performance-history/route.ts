import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { log } from '@/lib/logger';
import { performanceHistory } from '@/lib/monitoring/performance-history';
import type { PerformanceHistoryResponse } from '@/lib/monitoring/types';

const performanceHistoryHandler = async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const timeRange = searchParams.get('timeRange') || '1h';
    const category = (searchParams.get('category') || 'standard') as 'standard' | 'analytics';

    const dataPoints = performanceHistory.getDataPoints(timeRange, category);
    const interval = performanceHistory.getInterval(timeRange);

    const response: PerformanceHistoryResponse = {
      dataPoints,
      interval,
      category,
      timeRange,
    };

    const duration = Date.now() - startTime;

    log.info('Performance history retrieved', {
      operation: 'get_performance_history',
      duration,
      dataPointCount: dataPoints.length,
      timeRange,
      category,
      component: 'monitoring',
    });

    return createSuccessResponse(response);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error(
      'Failed to get performance history',
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: 'get_performance_history',
        duration,
        component: 'monitoring',
      }
    );

    const fallback: PerformanceHistoryResponse = {
      dataPoints: [],
      interval: '1m',
      category: 'standard',
      timeRange: '1h',
    };

    return createSuccessResponse(fallback);
  }
};

export const GET = rbacRoute(performanceHistoryHandler, {
  permission: 'settings:read:all',
  rateLimit: 'api',
});

