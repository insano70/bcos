import { NextRequest } from 'next/server'
import { createSuccessResponse } from '@/lib/api/responses/success'
import { createErrorResponse } from '@/lib/api/responses/error'

/**
 * External services health check endpoint
 * Tests connectivity to external dependencies
 */
export async function GET(request: NextRequest) {
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

async function checkEmailService(): Promise<{ name: string; healthy: boolean; responseTime: number; error?: string }> {
  const startTime = Date.now()
  
  try {
    // Test email service connectivity (adjust based on your email provider)
    if (process.env.RESEND_API_KEY) {
      const response = await fetch('https://api.resend.com/domains', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      })
      
      const healthy = response.ok
      const result = {
        name: 'Email Service (Resend)',
        healthy,
        responseTime: Date.now() - startTime,
      } as { name: string; healthy: boolean; responseTime: number; error?: string }
      
      if (!healthy) {
        result.error = `HTTP ${response.status}`
      }
      
      return result
    } else {
      return {
        name: 'Email Service',
        healthy: false,
        responseTime: Date.now() - startTime,
        error: 'No email service configured'
      }
    }
  } catch (error) {
    return {
      name: 'Email Service',
      healthy: false,
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
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
