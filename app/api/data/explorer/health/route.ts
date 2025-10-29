import type { NextRequest } from 'next/server';
import { publicRoute } from '@/lib/api/route-handlers';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { checkAnalyticsDbHealth } from '@/lib/services/analytics-db';

const healthCheckHandler = async (_request: NextRequest): Promise<Response> => {
  const { isHealthy, latency, error } = await checkAnalyticsDbHealth();

  return createSuccessResponse({
    status: isHealthy ? 'healthy' : 'degraded',
    analytics_db: isHealthy,
    latency,
    error,
    timestamp: new Date().toISOString(),
  });
};

export const GET = publicRoute(
  healthCheckHandler,
  'Data Explorer health check endpoint for monitoring',
  { rateLimit: 'api' }
);

export const dynamic = 'force-dynamic';

