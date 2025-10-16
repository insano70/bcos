import type { NextRequest } from 'next/server';
import { correlation, log } from '@/lib/logger';
import { createRBACMiddleware } from '@/lib/rbac/middleware';
import type { PermissionName, UserContext } from '@/lib/types/rbac';
import { applyGlobalAuth, markAsPublicRoute } from './middleware/global-auth';
import { applyRateLimit } from './middleware/rate-limit';
import { createErrorResponse } from './responses/error';
import type { AuthSession } from './route-handler';

/**
 * Enhanced API Route Handler with RBAC Integration
 * Extends existing security with permission-based access control
 */

interface RBACRouteOptions {
  rateLimit?: 'auth' | 'api' | 'upload';
  requireAuth?: boolean;
  publicReason?: string; // Required if requireAuth is false

  // RBAC options
  permission?: PermissionName | PermissionName[];
  requireAllPermissions?: boolean;
  extractResourceId?: ((request: NextRequest) => string | undefined) | undefined;
  extractOrganizationId?: ((request: NextRequest) => string | undefined) | undefined;
  onPermissionDenied?: (userContext: UserContext, deniedPermissions: string[]) => Response;
}

/**
 * Secure route with RBAC permission checking
 */
export function rbacRoute(
  handler: (
    request: NextRequest,
    userContext: UserContext,
    ...args: unknown[]
  ) => Promise<Response>,
  options: RBACRouteOptions & { permission: PermissionName | PermissionName[] }
) {
  return async (request: NextRequest, ...args: unknown[]): Promise<Response> => {
    // Extract or generate correlation ID from request header (set by middleware)
    const correlationId = request.headers.get('x-correlation-id') || correlation.generate();
    const url = new URL(request.url);

    // Wrap entire request lifecycle in correlation context
    return correlation.withContext(
      correlationId,
      {
        method: request.method,
        path: url.pathname,
        requestId: request.headers.get('x-request-id') || undefined,
      },
      async () => {
        const startTime = Date.now();

        // Set additional request context (IP, User-Agent)
        const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
        const userAgent = request.headers.get('user-agent');

        correlation.setRequest({
          method: request.method,
          path: url.pathname,
          ...(ipAddress && { ipAddress }),
          ...(userAgent && { userAgent }),
        });

        log.api(`${request.method} ${url.pathname} - RBAC route`, request, 0, 0);

    log.info('RBAC route initiated', {
      endpoint: url.pathname,
      method: request.method,
      requiredPermissions: Array.isArray(options.permission)
        ? options.permission
        : [options.permission],
      requireAllPermissions: options.requireAllPermissions || false,
    });

    try {
      // 1. Apply rate limiting
      if (options.rateLimit) {
        const rateLimitStart = Date.now();
        await applyRateLimit(request, options.rateLimit);
        log.info('Rate limit check completed', {
          duration: Date.now() - rateLimitStart,
          limitType: options.rateLimit,
        });
      }

      // 2. Apply authentication (unless explicitly public)
      let session = null;
      if (options.requireAuth !== false) {
        const authStart = Date.now();
        session = await applyGlobalAuth(request);
        log.info('Global auth check completed', { duration: Date.now() - authStart });

        log.debug('Global authentication completed', {
          hasSession: !!session,
          hasUser: !!session?.user?.id,
        });
      } else if (options.publicReason) {
        markAsPublicRoute(options.publicReason);
        log.debug('Route marked as public', {
          reason: options.publicReason,
        });
      }

      // 3. Get user context for RBAC
      // Skip authentication check for public routes
      if (options.requireAuth !== false && !session?.user?.id) {
        log.warn('RBAC authentication failed - no user session', {
          hasSession: !!session,
          sessionKeys: session ? Object.keys(session) : [],
        });

        log.security('rbac_auth_failed', 'medium', {
          reason: 'no_user_session',
          action: 'authentication_check',
        });

        log.auth('rbac_check', false, {
          reason: 'no_user_session',
        });
        return createErrorResponse('Authentication required', 401, request) as Response;
      }

      // For public routes, skip user context loading
      if (options.requireAuth === false) {
        log.debug('Public route - skipping user context and RBAC checks', {
          endpoint: url.pathname,
          publicReason: options.publicReason,
        });

        // Call the handler directly for public routes
        const handlerStart = Date.now();
        const response = await handler(request, {} as UserContext, ...args);
        log.info('Handler execution completed', {
          duration: Date.now() - handlerStart,
          statusCode: response.status,
          isPublic: true,
        });

        const totalDuration = Date.now() - startTime;

        log.info('Public route completed successfully', {
          endpoint: url.pathname,
          statusCode: response.status,
          totalDuration,
        });

        // Record metrics in MetricsCollector for public routes
        try {
          const { metricsCollector } = await import('@/lib/monitoring/metrics-collector');
          const { categorizeEndpoint } = await import('@/lib/monitoring/endpoint-categorizer');
          
          const category = categorizeEndpoint(url.pathname);
          
          metricsCollector.recordRequest(
            url.pathname,
            totalDuration,
            response.status,
            undefined, // No userId for public routes
            category
          );

          // Record security events
          if (response.status === 429) {
            metricsCollector.recordRateLimitBlock();
          }
        } catch {
          // Silently fail if MetricsCollector not available
        }

        return response;
      }

      const contextStart = Date.now();

      // Additional safety check - session and user should exist at this point due to earlier guards
      if (!session?.user?.id) {
        log.error('Missing session user ID after authentication check');
        return createErrorResponse('Authentication required', 401, request) as Response;
      }

      const userId = session.user.id;

      // ✅ OPTIMIZATION: Use userContext already fetched in applyGlobalAuth()
      // This eliminates 4-6 redundant database queries per request
      const userContext = session.userContext;

      log.info('User context retrieved from session', {
        duration: Date.now() - contextStart,
        userId,
        cached: true, // Indicates we used cached context from session
      });

      if (!userContext) {
        log.error('User context missing from session', undefined, {
          userId,
          sessionEmail: session.user.email,
          sessionKeys: session ? Object.keys(session) : [],
        });

        log.security('rbac_context_missing', 'high', {
          userId,
          reason: 'context_not_in_session',
          alert: 'This should not happen - investigate applyGlobalAuth()',
        });

        log.auth('rbac_check', false, {
          userId,
          reason: 'context_missing_from_session',
        });

        return createErrorResponse(
          'Failed to load user context - authentication state invalid',
          500,
          request
        ) as Response;
      }

      log.debug('User context loaded successfully', {
        userId: userContext.user_id,
        organizationId: userContext.current_organization_id,
        roleCount: userContext.roles?.length || 0,
        permissionCount: userContext.all_permissions?.length || 0,
        isSuperAdmin: userContext.is_super_admin,
      });

      // 4. Apply RBAC middleware
      const rbacStart = Date.now();
      const rbacMiddleware = createRBACMiddleware(options.permission, {
        requireAll: options.requireAllPermissions,
        extractResourceId: options.extractResourceId,
        extractOrganizationId: options.extractOrganizationId,
      });

      const rbacResult = await rbacMiddleware(request, userContext);
      const rbacDuration = Date.now() - rbacStart;

      log.info('RBAC permission check completed', {
        duration: rbacDuration,
        userId: userContext.user_id,
        permissions: Array.isArray(options.permission) ? options.permission : [options.permission],
        requireAll: options.requireAllPermissions || false,
      });

      if ('success' in rbacResult && rbacResult.success) {
        log.info('RBAC permission check passed', {
          userId: userContext.user_id,
          permissions: Array.isArray(options.permission)
            ? options.permission
            : [options.permission],
          rbacDuration,
        });

        log.auth('rbac_check', true, {
          userId: userContext.user_id,
        });

        // 5. Call the actual handler with user context
        const handlerStart = Date.now();
        const response = await handler(request, rbacResult.userContext, ...args);
        log.info('Handler execution completed', {
          duration: Date.now() - handlerStart,
          userId: userContext.user_id,
          statusCode: response.status,
        });

        const totalDuration = Date.now() - startTime;
        log.info('RBAC route completed successfully', {
          userId: userContext.user_id,
          statusCode: response.status,
          totalDuration,
        });

        // Record metrics in MetricsCollector for real-time monitoring
        try {
          const { metricsCollector } = await import('@/lib/monitoring/metrics-collector');
          const { categorizeEndpoint } = await import('@/lib/monitoring/endpoint-categorizer');
          
          const category = categorizeEndpoint(url.pathname);
          
          metricsCollector.recordRequest(
            url.pathname,
            totalDuration,
            response.status,
            userContext.user_id,
            category
          );

          // Record security events
          if (response.status === 429) {
            metricsCollector.recordRateLimitBlock();
          }
          if (response.status === 401 || response.status === 403) {
            metricsCollector.recordFailedLogin();
          }
        } catch {
          // Silently fail if MetricsCollector not available
          // Don't break the response if monitoring fails
        }

        return response;
      } else {
        // Permission denied - return RBAC response
        log.warn('RBAC permission denied', {
          userId: userContext.user_id,
          requiredPermissions: Array.isArray(options.permission)
            ? options.permission
            : [options.permission],
          userPermissions: userContext.all_permissions?.map((p) => p.name) || [],
          rbacDuration,
        });

        log.security('rbac_permission_denied', 'medium', {
          userId: userContext.user_id,
          action: 'permission_check',
          reason: 'insufficient_permissions',
        });

        log.auth('rbac_check', false, {
          userId: userContext.user_id,
          reason: 'permission_denied',
        });

        // Record metrics for permission denied
        try {
          const { metricsCollector } = await import('@/lib/monitoring/metrics-collector');
          const { categorizeEndpoint } = await import('@/lib/monitoring/endpoint-categorizer');
          
          const response = rbacResult as Response;
          const category = categorizeEndpoint(url.pathname);
          
          metricsCollector.recordRequest(
            url.pathname,
            Date.now() - startTime,
            response.status,
            userContext.user_id,
            category
          );
          if (response.status === 403) {
            metricsCollector.recordSecurityEvent('permission_denied');
          }
        } catch {
          // Silently fail
        }

        return rbacResult as Response;
      }
    } catch (error) {
      const totalDuration = Date.now() - startTime;

      log.error('RBAC route error', error, {
        endpoint: url.pathname,
        method: request.method,
        totalDuration,
        errorType:
          error &&
          typeof error === 'object' &&
          'constructor' in error &&
          error.constructor &&
          'name' in error.constructor
            ? String(error.constructor.name)
            : typeof error,
      });

      // Record metrics for error
      try {
        const { metricsCollector } = await import('@/lib/monitoring/metrics-collector');
        const { categorizeEndpoint } = await import('@/lib/monitoring/endpoint-categorizer');
        
        const category = categorizeEndpoint(url.pathname);
        
        metricsCollector.recordRequest(
          url.pathname,
          totalDuration,
          500,
          undefined, // May not have userId if error occurred before auth
          category
        );
      } catch {
        // Silently fail
      }

      return createErrorResponse(
        error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : 'Unknown error',
        500,
        request
      ) as Response;
    }
      }
    ); // End correlation.withContext
  };
}

/**
 * Public route (no authentication or RBAC required)
 */
export function publicRoute(
  handler: (request: NextRequest, ...args: unknown[]) => Promise<Response>,
  reason: string,
  options: Omit<RBACRouteOptions, 'requireAuth' | 'publicReason' | 'permission'> = {}
) {
  return rbacRoute(
    // Wrap handler to match expected signature
    async (request: NextRequest, _userContext: UserContext, ...args: unknown[]) => {
      return await handler(request, ...args);
    },
    {
      ...options,
      requireAuth: false,
      publicReason: reason,
      permission: [] as PermissionName[], // No permissions required for public routes
    }
  );
}

// Deprecated route wrappers removed - use rbacRoute with extractors from @/lib/api/utils/rbac-extractors

/**
 * Backward compatibility wrapper for existing secureRoute usage
 * Provides a migration path from basic auth to RBAC
 */
export function legacySecureRoute(
  handler: (request: NextRequest, session?: AuthSession, ...args: unknown[]) => Promise<Response>,
  options: {
    rateLimit?: 'auth' | 'api' | 'upload';
    requireAuth?: boolean;
    publicReason?: string;
  } = {}
) {
  return async (request: NextRequest, ...args: unknown[]): Promise<Response> => {
    // Extract or generate correlation ID from request header (set by middleware)
    const correlationId = request.headers.get('x-correlation-id') || correlation.generate();
    const url = new URL(request.url);

    // Wrap entire request lifecycle in correlation context
    return correlation.withContext(
      correlationId,
      {
        method: request.method,
        path: url.pathname,
        requestId: request.headers.get('x-request-id') || undefined,
      },
      async () => {
        const startTime = Date.now();

        // Set additional request context (IP, User-Agent)
        const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
        const userAgent = request.headers.get('user-agent');

        correlation.setRequest({
          method: request.method,
          path: url.pathname,
          ...(ipAddress && { ipAddress }),
          ...(userAgent && { userAgent }),
        });

        log.info('Legacy secure route initiated', {
          endpoint: url.pathname,
          method: request.method,
          requireAuth: options.requireAuth !== false,
        });

    try {
      // 1. Apply rate limiting
      if (options.rateLimit) {
        const rateLimitStart = Date.now();
        await applyRateLimit(request, options.rateLimit);
        log.info('Rate limit check completed', {
          duration: Date.now() - rateLimitStart,
          limitType: options.rateLimit,
        });
      }

      // 2. Apply authentication (unless explicitly public)
      let session = null;
      if (options.requireAuth !== false) {
        const authStart = Date.now();
        session = await applyGlobalAuth(request);
        log.info('Legacy auth check completed', { duration: Date.now() - authStart });

        log.debug('Legacy authentication completed', {
          hasSession: !!session,
          hasUser: !!session?.user?.id,
        });

        if (session?.user?.id) {
          log.auth('legacy_auth', true, {
            userId: session.user.id,
          });
        } else {
          log.auth('legacy_auth', false, {
            reason: 'no_session',
          });
        }
      } else if (options.publicReason) {
        markAsPublicRoute(options.publicReason);
        log.debug('Legacy route marked as public', {
          reason: options.publicReason,
        });
      }

      // 3. Call the actual handler (legacy style)
      const handlerStart = Date.now();
      const response = await handler(request, session || undefined, ...args);
      log.info('Legacy handler execution completed', {
        duration: Date.now() - handlerStart,
        userId: session?.user?.id,
        statusCode: response.status,
      });

      const totalDuration = Date.now() - startTime;
      log.info('Legacy secure route completed', {
        userId: session?.user?.id,
        statusCode: response.status,
        totalDuration,
      });

      // Record metrics for legacy routes
      try {
        const { metricsCollector } = await import('@/lib/monitoring/metrics-collector');
        const { categorizeEndpoint } = await import('@/lib/monitoring/endpoint-categorizer');
        
        const category = categorizeEndpoint(url.pathname);
        
        metricsCollector.recordRequest(
          url.pathname,
          totalDuration,
          response.status,
          session?.user?.id,
          category
        );

        // Record security events
        if (response.status === 429) {
          metricsCollector.recordRateLimitBlock();
        }
        if (response.status === 401 || response.status === 403) {
          metricsCollector.recordFailedLogin();
        }
      } catch {
        // Silently fail
      }

      return response;
    } catch (error) {
      const totalDuration = Date.now() - startTime;

      log.error('Legacy secure route error', error, {
        endpoint: url.pathname,
        method: request.method,
        totalDuration,
        errorType:
          error &&
          typeof error === 'object' &&
          'constructor' in error &&
          error.constructor &&
          'name' in error.constructor
            ? String(error.constructor.name)
            : typeof error,
      });

      // Record metrics for legacy error
      try {
        const { metricsCollector } = await import('@/lib/monitoring/metrics-collector');
        const { categorizeEndpoint } = await import('@/lib/monitoring/endpoint-categorizer');
        
        const category = categorizeEndpoint(url.pathname);
        
        metricsCollector.recordRequest(
          url.pathname,
          totalDuration,
          500,
          undefined, // May not have userId if error occurred before auth
          category
        );
      } catch {
        // Silently fail
      }

      return createErrorResponse(
        error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : 'Unknown error',
        500,
        request
      ) as Response;
    }
      }
    ); // End correlation.withContext
  };
}

/**
 * Migration helper to gradually move from basic auth to RBAC
 * This allows existing routes to work while adding RBAC incrementally
 */
export function migrateToRBAC(
  legacyHandler: (
    request: NextRequest,
    session?: AuthSession,
    ...args: unknown[]
  ) => Promise<Response>,
  permission: PermissionName | PermissionName[],
  options: Omit<RBACRouteOptions, 'permission'> = {}
) {
  return rbacRoute(
    // Convert legacy handler to RBAC handler
    async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
      log.debug('Legacy handler migration', {
        userId: userContext.user_id,
        migratedPermissions: Array.isArray(permission) ? permission : [permission],
        legacyRole: userContext.is_super_admin ? 'super_admin' : 'user',
      });

      // Create a session-like object for backward compatibility
      const legacySession = {
        user: {
          id: userContext.user_id,
          email: userContext.email,
          name: `${userContext.first_name} ${userContext.last_name}`,
          firstName: userContext.first_name,
          lastName: userContext.last_name,
          role: userContext.is_super_admin ? 'super_admin' : 'user',
          emailVerified: userContext.email_verified,
        },
      };

      const handlerStart = Date.now();
      const response = await legacyHandler(request, legacySession as AuthSession, ...args);
      log.info('Legacy handler execution completed', {
        duration: Date.now() - handlerStart,
        userId: userContext.user_id,
        statusCode: response.status,
      });

      return response;
    },
    {
      ...options,
      permission,
      requireAuth: true,
    }
  );
}


// Export legacy functions for backward compatibility
export { legacySecureRoute as secureRoute };
// adminRoute removed - use rbacRoute with rbacConfigs.superAdmin
