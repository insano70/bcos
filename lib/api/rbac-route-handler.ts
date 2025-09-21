import type { NextRequest } from 'next/server';
import { applyRateLimit } from './middleware/rate-limit';
import { applyGlobalAuth, markAsPublicRoute } from './middleware/global-auth';
import { createErrorResponse } from './responses/error';
import { getUserContextSafe } from '@/lib/rbac/user-context';
import { createRBACMiddleware, } from '@/lib/rbac/middleware';
import type { PermissionName, UserContext } from '@/lib/types/rbac';
import { 
  createAPILogger, 
  logAPIAuth, 
  logAPIRequest, 
  logAPIResponse,
  logDBOperation,
  logSecurityEvent,
  logPerformanceMetric,
  withCorrelation,
  CorrelationContextManager 
} from '@/lib/logger';

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
  handler: (request: NextRequest, userContext: UserContext, ...args: unknown[]) => Promise<Response>,
  options: RBACRouteOptions & { permission: PermissionName | PermissionName[] }
) {
  return withCorrelation(async (request: NextRequest, ...args: unknown[]): Promise<Response> => {
    const startTime = Date.now()
    const logger = createAPILogger(request)
    const url = new URL(request.url)
    
    logger.info('RBAC route initiated', {
      endpoint: url.pathname,
      method: request.method,
      requiredPermissions: Array.isArray(options.permission) ? options.permission : [options.permission],
      requireAllPermissions: options.requireAllPermissions || false
    })

    try {
      // 1. Apply rate limiting
      if (options.rateLimit) {
        const rateLimitStart = Date.now()
        await applyRateLimit(request, options.rateLimit)
        logPerformanceMetric(logger, 'rate_limit_check', Date.now() - rateLimitStart, {
          limitType: options.rateLimit
        })
      }
      
      // 2. Apply authentication (unless explicitly public)
      let session = null
      if (options.requireAuth !== false) {
        const authStart = Date.now()
        session = await applyGlobalAuth(request)
        logPerformanceMetric(logger, 'global_auth_check', Date.now() - authStart)
        
        logger.debug('Global authentication completed', {
          hasSession: !!session,
          hasUser: !!session?.user?.id
        })
      } else if (options.publicReason) {
        markAsPublicRoute(options.publicReason)
        logger.debug('Route marked as public', {
          reason: options.publicReason
        })
      }

      // 3. Get user context for RBAC
      // Skip authentication check for public routes
      if (options.requireAuth !== false && !session?.user?.id) {
        logger.warn('RBAC authentication failed - no user session', {
          hasSession: !!session,
          sessionKeys: session ? Object.keys(session) : []
        })
        
        logSecurityEvent(logger, 'rbac_auth_failed', 'medium', {
          reason: 'no_user_session',
          endpoint: url.pathname
        })
        
        logAPIAuth(logger, 'rbac_check', false, undefined, 'no_user_session')
        return createErrorResponse('Authentication required', 401, request) as Response
      }

      // For public routes, skip user context loading
      if (options.requireAuth === false) {
        logger.debug('Public route - skipping user context and RBAC checks', {
          endpoint: url.pathname,
          publicReason: options.publicReason
        })
        
        // Call the handler directly for public routes
        const handlerStart = Date.now()
        const response = await handler(request, {} as UserContext, ...args)
        logPerformanceMetric(logger, 'handler_execution', Date.now() - handlerStart, {
          statusCode: response.status,
          isPublic: true
        })
        
        const totalDuration = Date.now() - startTime
        logger.info('Public route completed successfully', {
          endpoint: url.pathname,
          statusCode: response.status,
          totalDuration
        })
        
        return response
      }

      const contextStart = Date.now()
      const userSession = session as AuthResult // We know session exists from earlier check
      const userContext = await getUserContextSafe(userSession.user.id)
      logPerformanceMetric(logger, 'user_context_fetch', Date.now() - contextStart, {
        userId: userSession.user.id
      })

      if (!userContext) {
        logger.error('Failed to load user context for RBAC', {
          userId: userSession.user.id,
          sessionEmail: userSession.user.email
        })

        logSecurityEvent(logger, 'rbac_context_failed', 'high', {
          userId: userSession.user.id,
          reason: 'context_load_failure'
        })

        logAPIAuth(logger, 'rbac_check', false, userSession.user.id, 'context_load_failure')
        return createErrorResponse('Failed to load user context', 500, request) as Response
      }

      logger.debug('User context loaded successfully', {
        userId: userContext.user_id,
        organizationId: userContext.current_organization_id,
        roleCount: userContext.roles?.length || 0,
        permissionCount: userContext.all_permissions?.length || 0,
        isSuperAdmin: userContext.is_super_admin
      })

      // 4. Apply RBAC middleware
      const rbacStart = Date.now()
      const rbacMiddleware = createRBACMiddleware(options.permission, {
        requireAll: options.requireAllPermissions,
        extractResourceId: options.extractResourceId,
        extractOrganizationId: options.extractOrganizationId
      })

      const rbacResult = await rbacMiddleware(request, userContext)
      const rbacDuration = Date.now() - rbacStart
      
      logPerformanceMetric(logger, 'rbac_permission_check', rbacDuration, {
        userId: userContext.user_id,
        permissions: Array.isArray(options.permission) ? options.permission : [options.permission],
        requireAll: options.requireAllPermissions || false
      })

      if ('success' in rbacResult && rbacResult.success) {
        logger.info('RBAC permission check passed', {
          userId: userContext.user_id,
          permissions: Array.isArray(options.permission) ? options.permission : [options.permission],
          rbacDuration
        })
        
        logAPIAuth(logger, 'rbac_check', true, userContext.user_id)
        
        // 5. Call the actual handler with user context
        const handlerStart = Date.now()
        const response = await handler(request, rbacResult.userContext, ...args)
        logPerformanceMetric(logger, 'handler_execution', Date.now() - handlerStart, {
          userId: userContext.user_id,
          statusCode: response.status
        })
        
        const totalDuration = Date.now() - startTime
        logger.info('RBAC route completed successfully', {
          userId: userContext.user_id,
          statusCode: response.status,
          totalDuration
        })
        
        return response
      } else {
        // Permission denied - return RBAC response
        logger.warn('RBAC permission denied', {
          userId: userContext.user_id,
          requiredPermissions: Array.isArray(options.permission) ? options.permission : [options.permission],
          userPermissions: userContext.all_permissions?.map(p => p.name) || [],
          rbacDuration
        })
        
        logSecurityEvent(logger, 'rbac_permission_denied', 'medium', {
          userId: userContext.user_id,
          requiredPermissions: Array.isArray(options.permission) ? options.permission : [options.permission],
          endpoint: url.pathname
        })
        
        logAPIAuth(logger, 'rbac_check', false, userContext.user_id, 'permission_denied')
        return rbacResult as Response
      }
      
    } catch (error) {
      const totalDuration = Date.now() - startTime
      
      logger.error('RBAC route error', error, {
        endpoint: url.pathname,
        method: request.method,
        totalDuration,
        errorType: error && typeof error === 'object' && 'constructor' in error && error.constructor && 'name' in error.constructor ? String(error.constructor.name) : typeof error
      })
      
      logPerformanceMetric(logger, 'rbac_route_duration', totalDuration, {
        success: false,
        errorType: error && typeof error === 'object' && 'name' in error ? String(error.name) : 'unknown'
      })
      
      return createErrorResponse(
        error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Unknown error', 
        500, 
        request
      ) as Response
    }
  })
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
      permission: [] as PermissionName[] // No permissions required for public routes
    }
  );
}

// Deprecated route wrappers removed - use rbacRoute with extractors from @/lib/api/utils/rbac-extractors

/**
 * Backward compatibility wrapper for existing secureRoute usage
 * Provides a migration path from basic auth to RBAC
 */
export function legacySecureRoute(
  handler: (request: NextRequest, session?: AuthResult | null, ...args: unknown[]) => Promise<Response>,
  options: { rateLimit?: 'auth' | 'api' | 'upload'; requireAuth?: boolean; publicReason?: string } = {}
) {
  return withCorrelation(async (request: NextRequest, ...args: unknown[]): Promise<Response> => {
    const startTime = Date.now()
    const logger = createAPILogger(request)
    const url = new URL(request.url)
    
    logger.info('Legacy secure route initiated', {
      endpoint: url.pathname,
      method: request.method,
      requireAuth: options.requireAuth !== false
    })

    try {
      // 1. Apply rate limiting
      if (options.rateLimit) {
        const rateLimitStart = Date.now()
        await applyRateLimit(request, options.rateLimit)
        logPerformanceMetric(logger, 'rate_limit_check', Date.now() - rateLimitStart, {
          limitType: options.rateLimit
        })
      }
      
      // 2. Apply authentication (unless explicitly public)
      let session = null
      if (options.requireAuth !== false) {
        const authStart = Date.now()
        session = await applyGlobalAuth(request)
        logPerformanceMetric(logger, 'legacy_auth_check', Date.now() - authStart)
        
        logger.debug('Legacy authentication completed', {
          hasSession: !!session,
          hasUser: !!session?.user?.id
        })
        
        if (session?.user?.id) {
          logAPIAuth(logger, 'legacy_auth', true, session.user.id)
        } else {
          logAPIAuth(logger, 'legacy_auth', false, undefined, 'no_session')
        }
      } else if (options.publicReason) {
        markAsPublicRoute(options.publicReason)
        logger.debug('Legacy route marked as public', {
          reason: options.publicReason
        })
      }
      
      // 3. Call the actual handler (legacy style)
      const handlerStart = Date.now()
      const response = await handler(request, session, ...args)
      logPerformanceMetric(logger, 'legacy_handler_execution', Date.now() - handlerStart, {
        userId: session?.user?.id,
        statusCode: response.status
      })
      
      const totalDuration = Date.now() - startTime
      logger.info('Legacy secure route completed', {
        userId: session?.user?.id,
        statusCode: response.status,
        totalDuration
      })
      
      return response
      
    } catch (error) {
      const totalDuration = Date.now() - startTime
      
      logger.error('Legacy secure route error', error, {
        endpoint: url.pathname,
        method: request.method,
        totalDuration,
        errorType: error && typeof error === 'object' && 'constructor' in error && error.constructor && 'name' in error.constructor ? String(error.constructor.name) : typeof error
      })
      
      logPerformanceMetric(logger, 'legacy_route_duration', totalDuration, {
        success: false,
        errorType: error && typeof error === 'object' && 'name' in error ? String(error.name) : 'unknown'
      })
      
      return createErrorResponse(
        error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Unknown error', 
        500, 
        request
      ) as Response
    }
  })
}

/**
 * Migration helper to gradually move from basic auth to RBAC
 * This allows existing routes to work while adding RBAC incrementally
 */
export function migrateToRBAC(
  legacyHandler: (request: NextRequest, session?: AuthResult | null, ...args: unknown[]) => Promise<Response>,
  permission: PermissionName | PermissionName[],
  options: Omit<RBACRouteOptions, 'permission'> = {}
) {
  return rbacRoute(
    // Convert legacy handler to RBAC handler
    async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
      const logger = createAPILogger(request).withUser(userContext.user_id, userContext.current_organization_id)
      
      logger.debug('Legacy handler migration', {
        userId: userContext.user_id,
        migratedPermissions: Array.isArray(permission) ? permission : [permission],
        legacyRole: userContext.is_super_admin ? 'super_admin' : 'user'
      })
      
      // Create a session-like object for backward compatibility
      const legacySession = {
        user: {
          id: userContext.user_id,
          email: userContext.email,
          name: `${userContext.first_name} ${userContext.last_name}`,
          firstName: userContext.first_name,
          lastName: userContext.last_name,
          role: userContext.is_super_admin ? 'super_admin' : 'user',
          emailVerified: userContext.email_verified
        }
      }

      const handlerStart = Date.now()
      const response = await legacyHandler(request, legacySession, ...args)
      logPerformanceMetric(logger, 'legacy_handler_execution', Date.now() - handlerStart, {
        userId: userContext.user_id,
        statusCode: response.status
      })

      return response
    },
    {
      ...options,
      permission,
      requireAuth: true
    }
  )
}

/**
 * Webhook route handler
 * Special handler for webhook endpoints that require signature verification
 * instead of user authentication
 */
interface WebhookRouteOptions {
  rateLimit?: 'auth' | 'api' | 'upload';
  verifySignature: (request: NextRequest, body: string) => Promise<boolean>;
  source: string; // e.g., 'stripe', 'resend', 'github'
}

export function webhookRoute(
  handler: (request: NextRequest, body: unknown, rawBody: string) => Promise<Response>,
  options: WebhookRouteOptions
) {
  return withCorrelation(async (request: NextRequest, ...args: unknown[]): Promise<Response> => {
    const startTime = Date.now()
    const logger = createAPILogger(request)
    const url = new URL(request.url)
    
    logger.info('Webhook request initiated', {
      endpoint: url.pathname,
      method: request.method,
      source: options.source
    })

    try {
      // 1. Apply rate limiting specific to webhooks
      if (options.rateLimit) {
        const rateLimitStart = Date.now()
        await applyRateLimit(request, options.rateLimit)
        logPerformanceMetric(logger, 'webhook_rate_limit_check', Date.now() - rateLimitStart, {
          source: options.source
        })
      }
      
      // 2. Read body as text for signature verification
      const bodyStart = Date.now()
      const rawBody = await request.text()
      logPerformanceMetric(logger, 'webhook_body_reading', Date.now() - bodyStart, {
        bodySize: rawBody.length,
        source: options.source
      })
      
      // 3. Verify webhook signature
      const signatureStart = Date.now()
      const isValid = await options.verifySignature(request, rawBody)
      logPerformanceMetric(logger, 'webhook_signature_verification', Date.now() - signatureStart, {
        source: options.source,
        valid: isValid
      })
      
      if (!isValid) {
        logger.warn('Webhook signature verification failed', {
          source: options.source,
          endpoint: url.pathname
        })
        
        logSecurityEvent(logger, 'webhook_signature_invalid', 'high', {
          source: options.source,
          endpoint: url.pathname
        })
        
        return createErrorResponse('Invalid webhook signature', 401, request)
      }
      
      logger.debug('Webhook signature verified successfully', {
        source: options.source
      })
      
      // 4. Parse the body
      let parsedBody: any
      try {
        parsedBody = JSON.parse(rawBody)
      } catch (parseError) {
        logger.error('Webhook body parse error', parseError, {
          source: options.source,
          bodyPreview: rawBody.substring(0, 100)
        })
        return createErrorResponse('Invalid webhook body', 400, request)
      }
      
      // 5. Call the handler with parsed body and raw body
      const handlerStart = Date.now()
      const response = await handler(request, parsedBody, rawBody)
      logPerformanceMetric(logger, 'webhook_handler_execution', Date.now() - handlerStart, {
        source: options.source,
        statusCode: response.status
      })
      
      const totalDuration = Date.now() - startTime
      logger.info('Webhook processed successfully', {
        source: options.source,
        statusCode: response.status,
        totalDuration
      })
      
      logPerformanceMetric(logger, 'webhook_total_duration', totalDuration, {
        source: options.source,
        success: response.status < 400
      })
      
      return response
      
    } catch (error) {
      const totalDuration = Date.now() - startTime
      
      logger.error('Webhook processing error', error, {
        source: options.source,
        endpoint: url.pathname,
        method: request.method,
        totalDuration,
        errorType: error && typeof error === 'object' && 'constructor' in error && error.constructor && 'name' in error.constructor ? String(error.constructor.name) : typeof error
      })
      
      logSecurityEvent(logger, 'webhook_processing_error', 'high', {
        source: options.source,
        endpoint: url.pathname,
        error: error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Unknown error'
      })
      
      logPerformanceMetric(logger, 'webhook_total_duration', totalDuration, {
        source: options.source,
        success: false,
        errorType: error && typeof error === 'object' && 'name' in error ? String(error.name) : 'unknown'
      })
      
      return createErrorResponse(
        error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Unknown error', 
        500, 
        request
      ) as Response
    }
  })
}

// Export legacy functions for backward compatibility
export { legacySecureRoute as secureRoute };
// adminRoute removed - use rbacRoute with rbacConfigs.superAdmin
