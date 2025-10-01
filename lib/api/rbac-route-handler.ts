import type { NextRequest } from 'next/server';
import { createAPILogger } from '@/lib/logger/api-features';
import { createRBACMiddleware } from '@/lib/rbac/middleware';
import { getUserContextSafe } from '@/lib/rbac/user-context';
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
    const startTime = Date.now();
    const apiLogger = createAPILogger(request, 'rbac-enforcement');
    const _logger = apiLogger.getLogger();
    const url = new URL(request.url);

    // Enhanced RBAC route request logging
    apiLogger.logRequest({
      authType: 'session',
    });

    apiLogger.info('RBAC route initiated', {
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
        apiLogger.timing('rate_limit_check', rateLimitStart, {
          limitType: options.rateLimit,
        });
      }

      // 2. Apply authentication (unless explicitly public)
      let session = null;
      if (options.requireAuth !== false) {
        const authStart = Date.now();
        session = await applyGlobalAuth(request);
        apiLogger.timing('global_auth_check', authStart);

        apiLogger.debug('Global authentication completed', {
          hasSession: !!session,
          hasUser: !!session?.user?.id,
        });
      } else if (options.publicReason) {
        markAsPublicRoute(options.publicReason);
        apiLogger.debug('Route marked as public', {
          reason: options.publicReason,
        });
      }

      // 3. Get user context for RBAC
      // Skip authentication check for public routes
      if (options.requireAuth !== false && !session?.user?.id) {
        apiLogger.warn('RBAC authentication failed - no user session', {
          hasSession: !!session,
          sessionKeys: session ? Object.keys(session) : [],
        });

        apiLogger.logSecurity('rbac_auth_failed', 'medium', {
          reason: 'no_user_session',
          action: 'authentication_check',
        });

        apiLogger.logAuth('rbac_check', false, {
          reason: 'no_user_session',
        });
        return createErrorResponse('Authentication required', 401, request) as Response;
      }

      // For public routes, skip user context loading
      if (options.requireAuth === false) {
        apiLogger.debug('Public route - skipping user context and RBAC checks', {
          endpoint: url.pathname,
          publicReason: options.publicReason,
        });

        // Call the handler directly for public routes
        const handlerStart = Date.now();
        const response = await handler(request, {} as UserContext, ...args);
        apiLogger.timing('handler_execution', handlerStart, {
          statusCode: response.status,
          isPublic: true,
        });

        const totalDuration = Date.now() - startTime;

        // Enhanced public route completion logging
        apiLogger.logResponse(response.status, {
          recordCount: 0,
          processingTimeBreakdown: {
            totalDuration,
          },
        });

        apiLogger.info('Public route completed successfully', {
          endpoint: url.pathname,
          statusCode: response.status,
          totalDuration,
        });

        return response;
      }

      const contextStart = Date.now();

      // Additional safety check - session and user should exist at this point due to earlier guards
      if (!session?.user?.id) {
        apiLogger.error('Missing session user ID after authentication check');
        return createErrorResponse('Authentication required', 401, request) as Response;
      }

      const userId = session.user.id; // Now TypeScript knows this is defined
      const userContext = await getUserContextSafe(userId);
      apiLogger.timing('user_context_fetch', contextStart, {
        userId,
      });

      if (!userContext) {
        apiLogger.error('Failed to load user context for RBAC', {
          userId,
          sessionEmail: session.user.email,
        });

        apiLogger.logSecurity('rbac_context_failed', 'high', {
          userId,
          reason: 'context_load_failure',
        });

        apiLogger.logAuth('rbac_check', false, {
          userId,
          reason: 'context_load_failure',
        });
        return createErrorResponse('Failed to load user context', 500, request) as Response;
      }

      apiLogger.debug('User context loaded successfully', {
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

      apiLogger.timing('rbac_permission_check', rbacDuration, {
        userId: userContext.user_id,
        permissions: Array.isArray(options.permission) ? options.permission : [options.permission],
        requireAll: options.requireAllPermissions || false,
      });

      if ('success' in rbacResult && rbacResult.success) {
        apiLogger.info('RBAC permission check passed', {
          userId: userContext.user_id,
          permissions: Array.isArray(options.permission)
            ? options.permission
            : [options.permission],
          rbacDuration,
        });

        apiLogger.logAuth('rbac_check', true, {
          userId: userContext.user_id,
        });

        // 5. Call the actual handler with user context
        const handlerStart = Date.now();
        const response = await handler(request, rbacResult.userContext, ...args);
        apiLogger.timing('handler_execution', handlerStart, {
          userId: userContext.user_id,
          statusCode: response.status,
        });

        const totalDuration = Date.now() - startTime;
        apiLogger.info('RBAC route completed successfully', {
          userId: userContext.user_id,
          statusCode: response.status,
          totalDuration,
        });

        return response;
      } else {
        // Permission denied - return RBAC response
        apiLogger.warn('RBAC permission denied', {
          userId: userContext.user_id,
          requiredPermissions: Array.isArray(options.permission)
            ? options.permission
            : [options.permission],
          userPermissions: userContext.all_permissions?.map((p) => p.name) || [],
          rbacDuration,
        });

        apiLogger.logSecurity('rbac_permission_denied', 'medium', {
          userId: userContext.user_id,
          action: 'permission_check',
          reason: 'insufficient_permissions',
        });

        apiLogger.logAuth('rbac_check', false, {
          userId: userContext.user_id,
          reason: 'permission_denied',
        });
        return rbacResult as Response;
      }
    } catch (error) {
      const totalDuration = Date.now() - startTime;

      apiLogger.error('RBAC route error', error, {
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

      apiLogger.timing('rbac_route_duration', totalDuration, {
        success: false,
        errorType:
          error && typeof error === 'object' && 'name' in error ? String(error.name) : 'unknown',
      });

      return createErrorResponse(
        error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : 'Unknown error',
        500,
        request
      ) as Response;
    }
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
    const startTime = Date.now();
    const apiLogger = createAPILogger(request);
    const url = new URL(request.url);

    apiLogger.info('Legacy secure route initiated', {
      endpoint: url.pathname,
      method: request.method,
      requireAuth: options.requireAuth !== false,
    });

    try {
      // 1. Apply rate limiting
      if (options.rateLimit) {
        const rateLimitStart = Date.now();
        await applyRateLimit(request, options.rateLimit);
        apiLogger.timing('rate_limit_check', rateLimitStart, {
          limitType: options.rateLimit,
        });
      }

      // 2. Apply authentication (unless explicitly public)
      let session = null;
      if (options.requireAuth !== false) {
        const authStart = Date.now();
        session = await applyGlobalAuth(request);
        apiLogger.timing('legacy_auth_check', authStart);

        apiLogger.debug('Legacy authentication completed', {
          hasSession: !!session,
          hasUser: !!session?.user?.id,
        });

        if (session?.user?.id) {
          apiLogger.logAuth('legacy_auth', true, {
            userId: session.user.id,
          });
        } else {
          apiLogger.logAuth('legacy_auth', false, {
            reason: 'no_session',
          });
        }
      } else if (options.publicReason) {
        markAsPublicRoute(options.publicReason);
        apiLogger.debug('Legacy route marked as public', {
          reason: options.publicReason,
        });
      }

      // 3. Call the actual handler (legacy style)
      const handlerStart = Date.now();
      const response = await handler(request, session || undefined, ...args);
      apiLogger.timing('legacy_handler_execution', handlerStart, {
        userId: session?.user?.id,
        statusCode: response.status,
      });

      const totalDuration = Date.now() - startTime;
      apiLogger.info('Legacy secure route completed', {
        userId: session?.user?.id,
        statusCode: response.status,
        totalDuration,
      });

      return response;
    } catch (error) {
      const totalDuration = Date.now() - startTime;

      apiLogger.error('Legacy secure route error', error, {
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

      apiLogger.timing('legacy_route_duration', totalDuration, {
        success: false,
        errorType:
          error && typeof error === 'object' && 'name' in error ? String(error.name) : 'unknown',
      });

      return createErrorResponse(
        error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : 'Unknown error',
        500,
        request
      ) as Response;
    }
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
      const apiLogger = createAPILogger(request).withUser(
        userContext.user_id,
        userContext.current_organization_id
      );

      apiLogger.debug('Legacy handler migration', {
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
      apiLogger.timing('legacy_handler_execution', handlerStart, {
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
  return async (request: NextRequest, ..._args: unknown[]): Promise<Response> => {
    const startTime = Date.now();
    const apiLogger = createAPILogger(request);
    const url = new URL(request.url);

    apiLogger.info('Webhook request initiated', {
      endpoint: url.pathname,
      method: request.method,
      source: options.source,
    });

    try {
      // 1. Apply rate limiting specific to webhooks
      if (options.rateLimit) {
        const rateLimitStart = Date.now();
        await applyRateLimit(request, options.rateLimit);
        apiLogger.timing('webhook_rate_limit_check', rateLimitStart, {
          source: options.source,
        });
      }

      // 2. Read body as text for signature verification
      const bodyStart = Date.now();
      const rawBody = await request.text();
      apiLogger.timing('webhook_body_reading', bodyStart, {
        bodySize: rawBody.length,
        source: options.source,
      });

      // 3. Verify webhook signature
      const signatureStart = Date.now();
      const isValid = await options.verifySignature(request, rawBody);
      apiLogger.timing('webhook_signature_verification', signatureStart, {
        source: options.source,
        valid: isValid,
      });

      if (!isValid) {
        apiLogger.warn('Webhook signature verification failed', {
          source: options.source,
          endpoint: url.pathname,
        });

        apiLogger.logSecurity('webhook_signature_invalid', 'high', {
          action: `webhook_verification_${options.source}`,
          reason: 'invalid_signature',
        });

        return createErrorResponse('Invalid webhook signature', 401, request);
      }

      apiLogger.debug('Webhook signature verified successfully', {
        source: options.source,
      });

      // 4. Parse the body
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(rawBody);
      } catch (parseError) {
        apiLogger.error('Webhook body parse error', parseError, {
          source: options.source,
          bodyPreview: rawBody.substring(0, 100),
        });
        return createErrorResponse('Invalid webhook body', 400, request);
      }

      // 5. Call the handler with parsed body and raw body
      const handlerStart = Date.now();
      const response = await handler(request, parsedBody, rawBody);
      apiLogger.timing('webhook_handler_execution', handlerStart, {
        source: options.source,
        statusCode: response.status,
      });

      const totalDuration = Date.now() - startTime;
      apiLogger.info('Webhook processed successfully', {
        source: options.source,
        statusCode: response.status,
        totalDuration,
      });

      apiLogger.timing('webhook_total_duration', totalDuration, {
        source: options.source,
        success: response.status < 400,
      });

      return response;
    } catch (error) {
      const totalDuration = Date.now() - startTime;

      apiLogger.error('Webhook processing error', error, {
        source: options.source,
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

      apiLogger.logSecurity('webhook_processing_error', 'high', {
        action: `webhook_processing_${options.source}`,
        reason: 'processing_failure',
      });

      apiLogger.timing('webhook_total_duration', totalDuration, {
        source: options.source,
        success: false,
        errorType:
          error && typeof error === 'object' && 'name' in error ? String(error.name) : 'unknown',
      });

      return createErrorResponse(
        error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : 'Unknown error',
        500,
        request
      ) as Response;
    }
  };
}

// Export legacy functions for backward compatibility
export { legacySecureRoute as secureRoute };
// adminRoute removed - use rbacRoute with rbacConfigs.superAdmin
