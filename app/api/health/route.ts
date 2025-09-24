import { NextRequest } from 'next/server'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse } from '@/lib/api/responses/error'
import { publicRoute } from '@/lib/api/rbac-route-handler'
import { 
  createAPILogger, 
  logPerformanceMetric 
} from '@/lib/logger'

/**
 * Health Check Endpoint (Optimized for Speed)
 * Lightweight endpoint for load balancer health checks
 * Removed expensive operations (database, cache initialization) for sub-second response
 * For detailed health info, use /api/health/db or /api/health/services
 */
const healthHandler = async (request: NextRequest) => {
  const startTime = Date.now()
  const logger = createAPILogger(request)
  
  logger.info('Health check request initiated', {
    endpoint: '/api/health',
    method: 'GET'
  })

  try {
    // Fast, lightweight system health data (no database or expensive operations)
    const systemHealth = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024),
      },
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      pid: process.pid
    }

    // Log performance metric
    const totalDuration = Date.now() - startTime
    logPerformanceMetric(logger, 'health_check_duration', totalDuration, {
      status: 'healthy'
    })

    logger.info('Health check completed successfully', {
      duration: totalDuration,
      memoryUsed: systemHealth.memory.used,
      uptime: systemHealth.uptime
    })

    return createSuccessResponse(systemHealth, 'System is healthy')
    
  } catch (error) {
    const totalDuration = Date.now() - startTime
    
    logger.error('Health check error', error, {
      duration: totalDuration,
      errorType: error instanceof Error ? error.constructor.name : typeof error
    })
    
    logPerformanceMetric(logger, 'health_check_duration', totalDuration, {
      status: 'error',
      errorType: error instanceof Error ? error.name : 'unknown'
    })
    
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 503, request)
  }
}

// Export as public route with rate limiting
// Health checks need to be public for monitoring tools and load balancers
export const GET = publicRoute(
  healthHandler,
  'Health check endpoint for monitoring tools and load balancers',
  { rateLimit: 'api' }
)
