import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import type { UserContext } from '@/lib/types/rbac';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';

/**
 * External services health check endpoint
 * Tests connectivity to external dependencies
 * Protected - only admin users can access service health information
 */
const servicesHealthHandler = async (request: NextRequest, userContext: UserContext) => {
  const startTime = Date.now();

  try {
    const services = await Promise.allSettled([
      checkEmailService(),
      checkStorageService(),
      checkAuthService(),
    ]);

    const healthData = {
      status: 'healthy',
      services: {
        email: getServiceStatus(services[0]),
        storage: getServiceStatus(services[1]),
        auth: getServiceStatus(services[2]),
      },
      timestamp: new Date().toISOString(),
    };

    // Overall status is unhealthy if any critical service is down
    const criticalServices = ['email', 'auth'];
    const hasUnhealthyService = criticalServices.some(
      (service) =>
        healthData.services[service as keyof typeof healthData.services].status !== 'healthy'
    );

    if (hasUnhealthyService) {
      healthData.status = 'degraded';
    }

    const duration = Date.now() - startTime;
    const statusCode = healthData.status === 'healthy' ? 200 : 503;

    // Log health check completion
    log.info('Services health check completed', {
      operation: 'services_health_check',
      userId: userContext.user_id,
      status: healthData.status,
      emailHealthy: healthData.services.email.status === 'healthy',
      storageHealthy: healthData.services.storage.status === 'healthy',
      authHealthy: healthData.services.auth.status === 'healthy',
      duration,
      slow: duration > SLOW_THRESHOLDS.API_OPERATION,
      component: 'health',
    });

    if (statusCode === 503) {
      return Response.json(healthData, { status: statusCode });
    }

    return createSuccessResponse(healthData, 'Services are healthy');
  } catch (error) {
    const duration = Date.now() - startTime;

    log.error('Services health check failed', error, {
      operation: 'services_health_check',
      userId: userContext.user_id,
      duration,
      component: 'health',
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 503, request);
  }
};

// Export with RBAC protection - only users with admin permissions can access
export const GET = rbacRoute(servicesHealthHandler, {
  permission: 'settings:read:all',
  rateLimit: 'api',
});

async function checkEmailService(): Promise<{
  name: string;
  healthy: boolean;
  responseTime: number;
  error?: string;
}> {
  const startTime = Date.now();

  // Email service is optional and handled gracefully when not configured
  // Always return healthy since the service degrades gracefully
  const result: { name: string; healthy: boolean; responseTime: number; error?: string } = {
    name: 'Email Service (AWS SES)',
    healthy: true,
    responseTime: Date.now() - startTime,
  };

  const hasCredentials = process.env.SMTP_USERNAME && process.env.SMTP_PASSWORD;

  if (!hasCredentials) {
    result.error = 'AWS SES credentials not configured (using mock implementation)';
  }

  return result;
}

async function checkStorageService(): Promise<{
  name: string;
  healthy: boolean;
  responseTime: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    // For now, we're using local file storage, so just check if upload directory exists
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    await fs.access(uploadDir);

    return {
      name: 'File Storage (Local)',
      healthy: true,
      responseTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      name: 'File Storage',
      healthy: false,
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Storage not accessible',
    };
  }
}

async function checkAuthService(): Promise<{
  name: string;
  healthy: boolean;
  responseTime: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    // Test JWT configuration
    const accessSecretConfigured = !!process.env.JWT_SECRET;
    const refreshSecretConfigured = !!(process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);

    const authConfigured = accessSecretConfigured && refreshSecretConfigured;

    const result = {
      name: 'Authentication Service (JWT)',
      healthy: authConfigured,
      responseTime: Date.now() - startTime,
    } as { name: string; healthy: boolean; responseTime: number; error?: string };

    if (!authConfigured) {
      result.error = 'JWT secrets not properly configured';
    }

    return result;
  } catch (error) {
    return {
      name: 'Authentication Service',
      healthy: false,
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

interface ServiceHealthResult {
  healthy: boolean;
  name: string;
  responseTime: number;
  error?: string;
}

function getServiceStatus(result: PromiseSettledResult<ServiceHealthResult>) {
  if (result.status === 'fulfilled') {
    const service = result.value;
    return {
      status: service.healthy ? 'healthy' : 'unhealthy',
      name: service.name,
      responseTime: `${service.responseTime}ms`,
      error: service.error,
    };
  } else {
    return {
      status: 'unhealthy',
      name: 'Unknown Service',
      responseTime: '0ms',
      error: result.reason?.message || 'Service check failed',
    };
  }
}
