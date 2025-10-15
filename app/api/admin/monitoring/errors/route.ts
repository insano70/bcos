/**
 * Errors API
 *
 * GET /api/admin/monitoring/errors
 *
 * Returns recent application errors from CloudWatch Logs.
 * Groups errors by endpoint and type for easier analysis.
 *
 * RBAC: settings:read:all (Super Admin only)
 */

import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { log } from '@/lib/logger';
import { queryErrors } from '@/lib/monitoring/cloudwatch-queries';
import type { ErrorsResponse, ErrorLogEntry } from '@/lib/monitoring/types';

const errorsHandler = async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 500);
    const timeRange = searchParams.get('timeRange') || '1h';

    log.info('Errors query initiated', {
      operation: 'query_errors',
      timeRange,
      limit,
      component: 'monitoring',
    });

    // Query CloudWatch Logs for errors
    const cloudwatchResults = await queryErrors(timeRange, limit);
    
    // Transform CloudWatch results to ErrorLogEntry objects
    const errors: ErrorLogEntry[] = cloudwatchResults.map((result) => ({
      timestamp: result['@timestamp'] || new Date().toISOString(),
      level: result.level || 'ERROR',
      message: result.message || 'Unknown error',
      operation: result.operation || 'unknown',
      endpoint: result.endpoint || 'unknown',
      statusCode: parseInt(result.statusCode || '500', 10),
      ...(result.correlationId && { correlationId: result.correlationId }),
      ...(result.userId && { userId: result.userId }),
    }));

    // Calculate summary
    const byEndpoint: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const byStatusCode: Record<number, number> = {};

    for (const error of errors) {
      byEndpoint[error.endpoint] = (byEndpoint[error.endpoint] || 0) + 1;
      byType[error.error?.name || 'Unknown'] = (byType[error.error?.name || 'Unknown'] || 0) + 1;
      byStatusCode[error.statusCode] = (byStatusCode[error.statusCode] || 0) + 1;
    }

    const response: ErrorsResponse = {
      errors,
      totalCount: errors.length,
      summary: {
        byEndpoint,
        byType,
        byStatusCode,
      },
      timeRange,
    };

    const duration = Date.now() - startTime;

    log.info('Errors retrieved', {
      operation: 'query_errors',
      duration,
      errorCount: errors.length,
      component: 'monitoring',
    });

    return createSuccessResponse(response);
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error(
      'Failed to get errors',
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: 'query_errors',
        duration,
        component: 'monitoring',
      }
    );

    const fallback: ErrorsResponse = {
      errors: [],
      totalCount: 0,
      summary: { byEndpoint: {}, byType: {}, byStatusCode: {} },
      timeRange: '1h',
    };

    return createSuccessResponse(fallback);
  }
};

export const GET = rbacRoute(errorsHandler, {
  permission: 'settings:read:all',
  rateLimit: 'api',
});

