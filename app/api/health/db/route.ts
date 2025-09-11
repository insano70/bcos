import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse } from '@/lib/api/responses/error'

/**
 * Database health check endpoint
 * Tests database connectivity and performance
 */
export async function GET(request: NextRequest) {
  try {
    const startTime = Date.now()
    
    // Test basic connectivity
    const [result] = await db.execute(sql`SELECT 1 as health_check, NOW() as current_time`)
    
    const endTime = Date.now()
    const responseTime = endTime - startTime

    // Test a simple query on a real table
    const [userCount] = await db.execute(sql`SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL`)
    const [practiceCount] = await db.execute(sql`SELECT COUNT(*) as count FROM practices WHERE deleted_at IS NULL`)

    const healthData = {
      status: 'healthy',
      database: {
        connected: true,
        responseTime: `${responseTime}ms`,
        currentTime: result?.current_time || new Date().toISOString(),
        queries: {
          basic: 'success',
          users: 'success',
          practices: 'success'
        }
      },
      statistics: {
        totalUsers: Number(userCount?.count || 0),
        totalPractices: Number(practiceCount?.count || 0),
      },
      timestamp: new Date().toISOString()
    }

    // Warn if response time is slow
    if (responseTime > 1000) {
      healthData.status = 'degraded'
      console.warn(`Database response time is slow: ${responseTime}ms`)
    }

    return createSuccessResponse(healthData, 'Database is healthy')
    
  } catch (error) {
    console.error('Database health check error:', error)
    
    const healthData = {
      status: 'unhealthy',
      database: {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown database error'
      },
      timestamp: new Date().toISOString()
    }

    return Response.json(healthData, { status: 503 })
  }
}
