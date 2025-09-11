import type { NextRequest } from 'next/server';
import { applyRateLimit } from './middleware/rate-limit';
import { applyGlobalAuth, markAsPublicRoute } from './middleware/global-auth';
import { createErrorResponse } from './responses/error';
import { getUserContextSafe } from '@/lib/rbac/user-context';
import { createRBACMiddleware, } from '@/lib/rbac/middleware';
import type { PermissionName, UserContext } from '@/lib/types/rbac';

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
  return async (request: NextRequest, ...args: unknown[]): Promise<Response> => {
    try {
      // 1. Apply rate limiting
      if (options.rateLimit) {
        await applyRateLimit(request, options.rateLimit);
      }
      
      // 2. Apply authentication (unless explicitly public)
      let session = null;
      if (options.requireAuth !== false) {
        session = await applyGlobalAuth(request);
      } else if (options.publicReason) {
        markAsPublicRoute(options.publicReason);
      }

      // 3. Get user context for RBAC
      if (!session?.user?.id) {
        return createErrorResponse('Authentication required', 401, request) as Response;
      }

      const userContext = await getUserContextSafe(session.user.id);
      if (!userContext) {
        return createErrorResponse('Failed to load user context', 500, request) as Response;
      }

      // 4. Apply RBAC middleware
      const rbacMiddleware = createRBACMiddleware(options.permission, {
        requireAll: options.requireAllPermissions,
        extractResourceId: options.extractResourceId,
        extractOrganizationId: options.extractOrganizationId
      });

      const rbacResult = await rbacMiddleware(request, userContext);
      
      if ('success' in rbacResult && rbacResult.success) {
        // 5. Call the actual handler with user context
        return await handler(request, rbacResult.userContext, ...args);
      } else {
        // Permission denied - return RBAC response
        return rbacResult as Response;
      }
      
    } catch (error) {
      console.error(`RBAC API route error [${request.method} ${new URL(request.url).pathname}]:`, error);
      return createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error', 
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
      permission: [] as PermissionName[] // No permissions required for public routes
    }
  );
}

/**
 * Admin-only route (requires super admin permissions)
 */
export function superAdminRoute(
  handler: (request: NextRequest, userContext: UserContext, ...args: unknown[]) => Promise<Response>,
  options: Omit<RBACRouteOptions, 'permission'> = {}
) {
  return rbacRoute(handler, {
    ...options,
    permission: ['users:read:all', 'practices:read:all'],
    requireAllPermissions: true,
    requireAuth: true
  });
}

/**
 * Organization admin route (requires practice admin permissions)
 */
export function orgAdminRoute(
  handler: (request: NextRequest, userContext: UserContext, ...args: unknown[]) => Promise<Response>,
  options: Omit<RBACRouteOptions, 'permission'> = {}
) {
  return rbacRoute(handler, {
    ...options,
    permission: ['users:create:organization', 'practices:update:own'],
    requireAllPermissions: false, // OR logic - either permission is sufficient
    requireAuth: true
  });
}

/**
 * User management route
 */
export function userRoute(
  permission: PermissionName | PermissionName[],
  handler: (request: NextRequest, userContext: UserContext, ...args: unknown[]) => Promise<Response>,
  options: Omit<RBACRouteOptions, 'permission'> = {}
) {
  return rbacRoute(handler, {
    ...options,
    permission,
    extractResourceId: (request) => {
      const pathSegments = request.nextUrl.pathname.split('/');
      const userIndex = pathSegments.indexOf('users');
      return userIndex >= 0 && pathSegments[userIndex + 1] ? pathSegments[userIndex + 1] : undefined;
    },
    extractOrganizationId: (request) => {
      return request.headers.get('x-organization-id') || undefined;
    }
  });
}

/**
 * Practice management route
 */
export function practiceRoute(
  permission: PermissionName | PermissionName[],
  handler: (request: NextRequest, userContext: UserContext, ...args: unknown[]) => Promise<Response>,
  options: Omit<RBACRouteOptions, 'permission'> = {}
) {
  return rbacRoute(handler, {
    ...options,
    permission,
    extractResourceId: (request) => {
      const pathSegments = request.nextUrl.pathname.split('/');
      const practiceIndex = pathSegments.indexOf('practices');
      return practiceIndex >= 0 && pathSegments[practiceIndex + 1] ? pathSegments[practiceIndex + 1] : undefined;
    },
    extractOrganizationId: (request) => {
      return request.nextUrl.searchParams.get('organizationId') || 
             request.headers.get('x-organization-id') || undefined;
    }
  });
}

/**
 * Analytics route with organization scoping
 */
export function analyticsRoute(
  permission: PermissionName | PermissionName[],
  handler: (request: NextRequest, userContext: UserContext, ...args: unknown[]) => Promise<Response>,
  options: Omit<RBACRouteOptions, 'permission'> = {}
) {
  return rbacRoute(handler, {
    ...options,
    permission,
    extractOrganizationId: (request) => {
      return request.nextUrl.searchParams.get('organizationId') || 
             request.headers.get('x-organization-id') || undefined;
    }
  });
}

/**
 * Backward compatibility wrapper for existing secureRoute usage
 * Provides a migration path from basic auth to RBAC
 */
export function legacySecureRoute(
  handler: (request: NextRequest, session?: any, ...args: unknown[]) => Promise<Response>,
  options: { rateLimit?: 'auth' | 'api' | 'upload'; requireAuth?: boolean; publicReason?: string } = {}
) {
  return async (request: NextRequest, ...args: unknown[]): Promise<Response> => {
    try {
      // 1. Apply rate limiting
      if (options.rateLimit) {
        await applyRateLimit(request, options.rateLimit);
      }
      
      // 2. Apply authentication (unless explicitly public)
      let session = null;
      if (options.requireAuth !== false) {
        session = await applyGlobalAuth(request);
      } else if (options.publicReason) {
        markAsPublicRoute(options.publicReason);
      }
      
      // 3. Call the actual handler (legacy style)
      return await handler(request, session, ...args);
      
    } catch (error) {
      console.error(`Legacy API route error [${request.method} ${new URL(request.url).pathname}]:`, error);
      return createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error', 
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
  legacyHandler: (request: NextRequest, session?: any, ...args: unknown[]) => Promise<Response>,
  permission: PermissionName | PermissionName[],
  options: Omit<RBACRouteOptions, 'permission'> = {}
) {
  return rbacRoute(
    // Convert legacy handler to RBAC handler
    async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
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
      };

      return await legacyHandler(request, legacySession, ...args);
    },
    {
      ...options,
      permission,
      requireAuth: true
    }
  );
}

// Export legacy functions for backward compatibility
export { legacySecureRoute as secureRoute };
export const adminRoute = superAdminRoute;
