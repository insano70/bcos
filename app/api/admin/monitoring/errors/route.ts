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
import type { ErrorsResponse, ErrorLogEntry } from '@/lib/monitoring/types';

const errorsHandler = async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 500);
    const timeRange = searchParams.get('timeRange') || '1h';
    // const endpointFilter = searchParams.get('endpoint');
    // const errorTypeFilter = searchParams.get('errorType');

    log.info('Errors query initiated', {
      operation: 'query_errors',
      timeRange,
      limit,
      component: 'monitoring',
    });

    // TODO: Query CloudWatch Logs for errors
    // For now, return empty data until CloudWatch SDK is configured
    const errors: ErrorLogEntry[] = [];

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

