import { NextRequest } from 'next/server'
import { db, checkDbHealth } from '@/lib/db'
import { checkAnalyticsDbHealth } from '@/lib/services/analytics-db'
import { sql } from 'drizzle-orm'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse } from '@/lib/api/responses/error'
import { rbacRoute } from '@/lib/api/rbac-route-handler'
import type { UserContext } from '@/lib/types/rbac'

/**
 * Database health check endpoint
 * Tests database connectivity, connection pooling, and performance
 * Protected - only admin users can access detailed health information
 */
const healthCheckHandler = async (request: NextRequest, userContext: UserContext) => {
  try {
    // Check main database health with connection pooling info
    const mainDbHealth = await checkDbHealth()
    
    // Check analytics database health
    const analyticsDbHealth = await checkAnalyticsDbHealth()
    
    // Test basic connectivity and queries
    const startTime = Date.now()
    const [result] = await db.execute(sql`SELECT 1 as health_check, NOW() as current_time`)
    const endTime = Date.now()
    const responseTime = endTime - startTime

    // Test queries on real tables
    const [userCount] = await db.execute(sql`SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL`)
    const [practiceCount] = await db.execute(sql`SELECT COUNT(*) as count FROM practices WHERE deleted_at IS NULL`)

    // Determine overall status
    const isMainDbHealthy = mainDbHealth.isHealthy
    const isAnalyticsDbHealthy = analyticsDbHealth.isHealthy
    const isSlowResponse = responseTime > 1000
    
    let overallStatus = 'healthy'
    if (!isMainDbHealthy) {
      overallStatus = 'unhealthy'
    } else if (!isAnalyticsDbHealthy || isSlowResponse) {
      overallStatus = 'degraded'
    }

    const healthData = {
      status: overallStatus,
      databases: {
        main: {
          connected: isMainDbHealthy,
          responseTime: `${responseTime}ms`,
          poolingEnabled: true,
          latency: mainDbHealth.latency ? `${mainDbHealth.latency}ms` : undefined,
          error: mainDbHealth.error,
          currentTime: result?.current_time || new Date().toISOString(),
          queries: {
            basic: 'success',
            users: 'success',
            practices: 'success'
          }
        },
        analytics: {
          connected: isAnalyticsDbHealthy,
          poolingEnabled: true,
          latency: analyticsDbHealth.latency ? `${analyticsDbHealth.latency}ms` : undefined,
          error: analyticsDbHealth.error,
          configured: !!process.env.ANALYTICS_DATABASE_URL
        }
      },
      statistics: {
        totalUsers: Number(userCount?.count || 0),
        totalPractices: Number(practiceCount?.count || 0),
      },
      timestamp: new Date().toISOString()
    }

    // Log warnings for degraded performance
    if (isSlowResponse) {
      console.warn(`Database response time is slow: ${responseTime}ms`)
    }
    if (!isAnalyticsDbHealthy && process.env.ANALYTICS_DATABASE_URL) {
      console.warn('Analytics database is unhealthy:', analyticsDbHealth.error)
    }

    if (overallStatus === 'unhealthy') {
      return createErrorResponse('Database health check failed', 503, request)
    }
    
    return createSuccessResponse(healthData, `Database status: ${overallStatus}`)
    
  } catch (error) {
    console.error('Database health check error:', error)
    
    const healthData = {
      status: 'unhealthy',
      databases: {
        main: {
          connected: false,
          poolingEnabled: true,
          error: error instanceof Error ? error.message : 'Unknown database error'
        },
        analytics: {
          connected: false,
          poolingEnabled: true,
          configured: !!process.env.ANALYTICS_DATABASE_URL
        }
      },
      timestamp: new Date().toISOString()
    }

    return createErrorResponse('Database health check failed', 503, request)
  }
}

// Export with RBAC protection - only users with admin permissions can access
export const GET = rbacRoute(
  healthCheckHandler,
  {
    permission: 'settings:read:all',
    rateLimit: 'api'
  }
);

