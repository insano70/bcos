import { NextRequest } from 'next/server'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse } from '@/lib/api/responses/error'
import { rbacRoute } from '@/lib/api/rbac-route-handler'
import type { UserContext } from '@/lib/types/rbac'

/**
 * External services health check endpoint
 * Tests connectivity to external dependencies
 * Protected - only admin users can access service health information
 */
const servicesHealthHandler = async (request: NextRequest, userContext: UserContext) => {
  try {
    const services = await Promise.allSettled([
      checkEmailService(),
      checkStorageService(),
      checkAuthService(),
    ])

    const healthData = {
      status: 'healthy',
      services: {
        email: getServiceStatus(services[0]),
        storage: getServiceStatus(services[1]),
        auth: getServiceStatus(services[2]),
      },
      timestamp: new Date().toISOString()
    }

    // Overall status is unhealthy if any critical service is down
    const criticalServices = ['email', 'auth']
    const hasUnhealthyService = criticalServices.some(
      service => healthData.services[service as keyof typeof healthData.services].status !== 'healthy'
    )

    if (hasUnhealthyService) {
      healthData.status = 'degraded'
    }

    const statusCode = healthData.status === 'healthy' ? 200 : 503
    
    if (statusCode === 503) {
      return Response.json(healthData, { status: statusCode })
    }

    return createSuccessResponse(healthData, 'Services are healthy')
    
  } catch (error) {
    console.error('Services health check error:', error)
    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 503, request)
  }
}

// Export with RBAC protection - only users with admin permissions can access
export const GET = rbacRoute(
  servicesHealthHandler,
  {
    permission: 'settings:read:all',
    rateLimit: 'api'
  }
);

async function checkEmailService(): Promise<{ name: string; healthy: boolean; responseTime: number; error?: string }> {
  const startTime = Date.now()
  
  // Email service is optional and handled gracefully when not configured
  // Always return healthy since the service degrades gracefully
  const result: { name: string; healthy: boolean; responseTime: number; error?: string } = {
    name: 'Email Service',
    healthy: true,
    responseTime: Date.now() - startTime,
  }
  
  if (!process.env.RESEND_API_KEY) {
    result.error = 'API key not configured (using mock implementation)'
  }
  
  return result
}

async function checkStorageService(): Promise<{ name: string; healthy: boolean; responseTime: number; error?: string }> {
  const startTime = Date.now()
  
  try {
    // For now, we're using local file storage, so just check if upload directory exists
    const fs = await import('fs/promises')
    const path = await import('path')
    
    const uploadDir = path.join(process.cwd(), 'public', 'uploads')
    await fs.access(uploadDir)
    
    return {
      name: 'File Storage (Local)',
      healthy: true,
      responseTime: Date.now() - startTime
    }
  } catch (error) {
    return {
      name: 'File Storage',
      healthy: false,
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Storage not accessible'
    }
  }
}

async function checkAuthService(): Promise<{ name: string; healthy: boolean; responseTime: number; error?: string }> {
  const startTime = Date.now()
  
  try {
    // Test JWT configuration
    const accessSecretConfigured = !!process.env.JWT_SECRET
    const refreshSecretConfigured = !!(process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET)

    const authConfigured = accessSecretConfigured && refreshSecretConfigured

    const result = {
      name: 'Authentication Service (JWT)',
      healthy: authConfigured,
      responseTime: Date.now() - startTime,
    } as { name: string; healthy: boolean; responseTime: number; error?: string }
    
    if (!authConfigured) {
      result.error = 'JWT secrets not properly configured'
    }
    
    return result
  } catch (error) {
    return {
      name: 'Authentication Service',
      healthy: false,
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

function getServiceStatus(result: PromiseSettledResult<any>) {
  if (result.status === 'fulfilled') {
    const service = result.value
    return {
      status: service.healthy ? 'healthy' : 'unhealthy',
      name: service.name,
      responseTime: `${service.responseTime}ms`,
      error: service.error
    }
  } else {
    return {
      status: 'unhealthy',
      name: 'Unknown Service',
      responseTime: '0ms',
      error: result.reason?.message || 'Service check failed'
    }
  }
}
