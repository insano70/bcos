import { NextRequest } from 'next/server'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse } from '@/lib/api/responses/error'

/**
 * Basic health check endpoint
 * Returns system status and basic information
 */
export async function GET(request: NextRequest) {
  try {
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch,
      }
    }

    return createSuccessResponse(healthData, 'System is healthy')
    
  } catch (error) {
    console.error('Health check error:', error)
    return createErrorResponse(error, 503, request)
  }
}
