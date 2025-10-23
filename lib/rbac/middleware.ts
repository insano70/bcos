import { type NextRequest, NextResponse } from 'next/server';
import { createErrorResponse } from '@/lib/api/responses/error';
import { log } from '@/lib/logger';
import { type PermissionName, RBACError, type UserContext } from '@/lib/types/rbac';
import type { AuthResult } from '../api/middleware/global-auth';
import { PermissionChecker } from './permission-checker';
import { getUserContextSafe } from './user-context';

/**
 * RBAC Middleware for Next.js API Routes
 * Integrates with existing authentication system to provide permission-based access control
 *
 * Philosophy:
 * - super_admin role gets special case handling (full access bypass)
 * - All other roles are just permission containers
 * - Access control is permission-based, not role-based
 * - Focus on "what can this user do?" rather than "what role do they have?"
 */

export interface RBACMiddlewareOptions {
  permission?: PermissionName | PermissionName[];
  requireAll?: boolean | undefined; // For multiple permissions (AND vs OR logic)
  extractResourceId?: ((request: NextRequest) => string | undefined) | undefined;
  extractOrganizationId?: ((request: NextRequest) => string | undefined) | undefined;
  onPermissionDenied?: (userContext: UserContext, deniedPermissions: string[]) => NextResponse;
}

/**
 * Create RBAC middleware for API routes
 */
export function createRBACMiddleware(
  requiredPermission: PermissionName | PermissionName[],
  options: Omit<RBACMiddlewareOptions, 'permission'> = {}
) {
  return async (
    request: NextRequest,
    userContext?: UserContext
  ): Promise<{ success: true; userContext: UserContext } | NextResponse> => {
    try {
      // If userContext is not provided, we need to get it from the session
      // This assumes the auth middleware has already validated the user
      const resolvedUserContext = userContext;

      if (!resolvedUserContext) {
        // Extract user ID from request (assuming it's been set by auth middleware)
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
          return createErrorResponse('Authentication required', 401, request) as NextResponse;
        }

        // We'll need to extract user ID from the token or session
        // For now, return auth error - this should be handled by auth middleware first
        return createErrorResponse('User context not available', 401, request) as NextResponse;
      }

      const checker = new PermissionChecker(resolvedUserContext);

      // Super admin bypass - full access to all resources
      if (checker.isSuperAdmin()) {
        log.debug('Super admin bypass - granting access', {
          userId: resolvedUserContext.user_id,
          permissions: Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission],
          component: 'rbac',
        });
        return { success: true, userContext: resolvedUserContext };
      }

      // Extract resource and organization IDs from request
      const resourceId = options.extractResourceId?.(request);
      const organizationId =
        options.extractOrganizationId?.(request) || resolvedUserContext.current_organization_id;

      // Check permissions (support both single permission and array)
      const permissions = Array.isArray(requiredPermission)
        ? requiredPermission
        : [requiredPermission];

      let hasAccess = false;
      const deniedPermissions: string[] = [];

      if (options.requireAll) {
        // AND logic - user must have ALL permissions
        hasAccess = checker.hasAllPermissions(permissions, resourceId, organizationId);
        if (!hasAccess) {
          permissions.forEach((permission) => {
            if (!checker.hasPermission(permission, resourceId, organizationId)) {
              deniedPermissions.push(permission);
            }
          });
        }
      } else {
        // OR logic - user must have ANY permission
        hasAccess = checker.hasAnyPermission(permissions, resourceId, organizationId);
        if (!hasAccess) {
          deniedPermissions.push(...permissions);
          // Debug logging for permission failures
          log.warn('Permission check failed for all provided permissions', {
            permissions,
            resourceId,
            organizationId,
            userId: resolvedUserContext.user_id,
            userPermissions: resolvedUserContext.all_permissions?.slice(0, 10).map(p => p.name),
            component: 'rbac',
          });
        }
      }

      if (!hasAccess) {
        // Custom permission denied handler
        if (options.onPermissionDenied) {
          return options.onPermissionDenied(resolvedUserContext, deniedPermissions);
        }

        // Default permission denied response
        return NextResponse.json(
          {
            success: false,
            error: 'Forbidden',
            message: `Missing required permissions: ${deniedPermissions.join(options.requireAll ? ' and ' : ' or ')}`,
            code: 'INSUFFICIENT_PERMISSIONS',
            details: {
              required_permissions: permissions,
              denied_permissions: deniedPermissions,
              user_id: resolvedUserContext.user_id,
              resource_id: resourceId,
              organization_id: organizationId,
            },
            meta: {
              timestamp: new Date().toISOString(),
              path: request.url,
            },
          },
          { status: 403 }
        );
      }

      // Permission granted - return success with user context
      return { success: true, userContext: resolvedUserContext };
    } catch (error) {
      log.error('RBAC middleware error', error, {
        operation: 'rbac_check',
        component: 'middleware',
      });

      if (error instanceof RBACError) {
        return NextResponse.json(
          {
            success: false,
            error: error.message,
            code: error.code,
            details: error.details,
            meta: {
              timestamp: new Date().toISOString(),
              path: request.url,
            },
          },
          { status: error.statusCode }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: 'Internal Server Error',
          code: 'RBAC_ERROR',
          meta: {
            timestamp: new Date().toISOString(),
            path: request.url,
          },
        },
        { status: 500 }
      );
    }
  };
}

/**
 * Specialized middleware creators for common use cases
 */

/**
 * Require a single permission
 */
export const requirePermission = (
  permission: PermissionName,
  options?: Omit<RBACMiddlewareOptions, 'permission'>
) => createRBACMiddleware(permission, options);

/**
 * Require any of multiple permissions (OR logic)
 */
export const requireAnyPermission = (
  permissions: PermissionName[],
  options?: Omit<RBACMiddlewareOptions, 'permission'>
) => createRBACMiddleware(permissions, { ...options, requireAll: false });

/**
 * Require all of multiple permissions (AND logic)
 */
export const requireAllPermissions = (
  permissions: PermissionName[],
  options?: Omit<RBACMiddlewareOptions, 'permission'>
) => createRBACMiddleware(permissions, { ...options, requireAll: true });

/**
 * Common middleware instances for frequent use cases
 */

// User management permissions
export const requireUserRead = createRBACMiddleware([
  'users:read:own',
  'users:read:organization',
  'users:read:all',
]);

export const requireUserWrite = createRBACMiddleware([
  'users:update:own',
  'users:update:organization',
]);

export const requireUserAdmin = createRBACMiddleware([
  'users:create:organization',
  'users:delete:organization',
]);

// Practice/Organization management permissions
export const requirePracticeRead = createRBACMiddleware([
  'practices:read:own',
  'practices:read:all',
]);

export const requirePracticeWrite = createRBACMiddleware(['practices:update:own']);

export const requirePracticeAdmin = createRBACMiddleware([
  'practices:staff:manage:own',
  'practices:manage:all',
]);

// Analytics permissions
export const requireAnalyticsRead = createRBACMiddleware([
  'analytics:read:organization',
  'analytics:read:all',
]);

export const requireAnalyticsExport = createRBACMiddleware(['analytics:export:organization']);

// System administration
export const requireSuperAdmin = createRBACMiddleware(
  ['users:read:all', 'practices:read:all', 'settings:update:all'],
  { requireAll: true }
);

/**
 * Resource ID extractors for common patterns
 */
export const extractors = {
  /**
   * Extract user ID from URL path (/api/users/[userId])
   */
  userIdFromPath: (request: NextRequest): string | undefined => {
    const pathSegments = request.nextUrl.pathname.split('/');
    const userIndex = pathSegments.indexOf('users');
    return userIndex >= 0 && pathSegments[userIndex + 1] ? pathSegments[userIndex + 1] : undefined;
  },

  /**
   * Extract practice ID from URL path (/api/practices/[practiceId])
   */
  practiceIdFromPath: (request: NextRequest): string | undefined => {
    const pathSegments = request.nextUrl.pathname.split('/');
    const practiceIndex = pathSegments.indexOf('practices');
    return practiceIndex >= 0 && pathSegments[practiceIndex + 1]
      ? pathSegments[practiceIndex + 1]
      : undefined;
  },

  /**
   * Extract organization ID from header
   */
  organizationIdFromHeader: (request: NextRequest): string | undefined => {
    return request.headers.get('x-organization-id') || undefined;
  },

  /**
   * Extract organization ID from query parameter
   */
  organizationIdFromQuery: (request: NextRequest): string | undefined => {
    return request.nextUrl.searchParams.get('organizationId') || undefined;
  },
};

/**
 * Helper function to create middleware with resource extraction
 */
export function createResourceMiddleware(
  permission: PermissionName | PermissionName[],
  resourceExtractor: (request: NextRequest) => string | undefined,
  organizationExtractor?: (request: NextRequest) => string | undefined
) {
  return createRBACMiddleware(permission, {
    extractResourceId: resourceExtractor,
    extractOrganizationId: organizationExtractor,
  });
}

/**
 * Middleware for user-specific endpoints
 */
export const createUserMiddleware = (permission: PermissionName | PermissionName[]) =>
  createResourceMiddleware(
    permission,
    extractors.userIdFromPath,
    extractors.organizationIdFromHeader
  );

/**
 * Middleware for practice-specific endpoints
 */
export const createPracticeMiddleware = (permission: PermissionName | PermissionName[]) =>
  createResourceMiddleware(
    permission,
    extractors.practiceIdFromPath,
    extractors.organizationIdFromQuery
  );

/**
 * Integration helper for existing auth middleware
 * This function bridges the gap between your existing auth system and RBAC
 */
export async function enhanceSessionWithRBAC(
  existingSession: AuthResult | null | undefined
): Promise<{ session: AuthResult; userContext: UserContext } | null> {
  try {
    if (!existingSession?.user?.id) {
      return null;
    }

    const userContext = await getUserContextSafe(existingSession.user.id);
    if (!userContext) {
      return null;
    }

    return {
      session: existingSession,
      userContext,
    };
  } catch (error) {
    log.error('Failed to enhance session with RBAC', error, {
      operation: 'enhance_session',
      component: 'middleware',
    });
    return null;
  }
}

/**
 * Wrapper for existing route handlers to add RBAC
 */
export function withRBAC<T extends unknown[]>(
  permission: PermissionName | PermissionName[],
  options: Omit<RBACMiddlewareOptions, 'permission'> = {}
) {
  const middleware = createRBACMiddleware(permission, options);

  return (
    handler: (request: NextRequest, userContext: UserContext, ...args: T) => Promise<Response>
  ) =>
    async (
      request: NextRequest,
      existingSession?: AuthResult | null,
      ...args: T
    ): Promise<Response> => {
      try {
        // If we have an existing session, enhance it with RBAC
        let userContext: UserContext;

        if (existingSession?.user?.id) {
          const enhanced = await enhanceSessionWithRBAC(existingSession);
          if (!enhanced) {
            return createErrorResponse('Failed to load user context', 500, request) as Response;
          }
          userContext = enhanced.userContext;
        } else {
          return createErrorResponse('Authentication required', 401, request) as Response;
        }

        // Apply RBAC middleware
        const middlewareResult = await middleware(request, userContext);

        if ('success' in middlewareResult && middlewareResult.success) {
          // Permission granted - call the handler
          return await handler(request, middlewareResult.userContext, ...args);
        } else {
          // Permission denied - return the middleware response
          return middlewareResult as Response;
        }
      } catch (error) {
        log.error('RBAC wrapper error', error, {
          operation: 'rbac_wrapper',
          component: 'middleware',
        });
        return createErrorResponse(
          error instanceof Error ? error.message : 'Unknown error',
          500,
          request
        ) as Response;
      }
    };
}
