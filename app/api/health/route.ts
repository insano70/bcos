import { NextResponse, type NextRequest } from 'next/server';
import { publicRoute } from '@/lib/api/route-handlers';
import { log } from '@/lib/logger';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

/**
 * Health Check Endpoint (Optimized for Speed)
 * Lightweight endpoint for load balancer health checks
 * Removed expensive operations (database, cache initialization) for sub-second response
 * For detailed health info, use /api/health/db or /api/health/services
 */
const healthHandler = async (_request: NextRequest) => {
  const timestamp = new Date().toISOString();

  log.debug('Health check ping', {
    operation: 'health_check',
    component: 'monitoring',
    endpoint: '/api/health',
  });

  return NextResponse.json({
    success: true,
    timestamp,
  });
};

// Export as public route without rate limiting
// Health checks need to be public and unrestricted for monitoring tools and load balancers
export const GET = publicRoute(
  healthHandler,
  'Health check endpoint for monitoring tools and load balancers'
);
