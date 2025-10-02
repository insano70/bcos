import type { NextRequest } from 'next/server';
import { rbacRoute } from '@/lib/api/rbac-route-handler';
import type { PermissionName, UserContext } from '@/lib/types/rbac';
import { createRBACMiddleware } from './middleware';

/**
 * Route Protection Decorators and Helpers
 * Provides declarative permission checking for API routes
 */

/**
 * Decorator function for RBAC protection (TypeScript experimental decorators)
 * Usage: @withRBAC('users:read:organization')
 */
export function withRBAC(permission: PermissionName | PermissionName[]) {
  return <T extends (...args: unknown[]) => unknown>(
    target: T,
    _context?: ClassMethodDecoratorContext
  ) => {
    const middleware = createRBACMiddleware(permission);

    return async function (
      this: unknown,
      request: NextRequest,
      userContext?: UserContext,
      ...args: unknown[]
    ) {
      const middlewareResult = await middleware(request, userContext);

      if ('success' in middlewareResult && middlewareResult.success) {
        // Permission granted - call original method
        return target.call(this, request, middlewareResult.userContext, ...args);
      } else {
        // Permission denied - return middleware response
        return middlewareResult;
      }
    } as T;
  };
}

/**
 * Higher-order function for permission protection (functional approach)
 */
export function requirePermissions(
  permissions: PermissionName | PermissionName[],
  requireAll = false
) {
  return (
    handler: (
      request: NextRequest,
      userContext: UserContext,
      ...args: unknown[]
    ) => Promise<Response>
  ) => {
    const middleware = createRBACMiddleware(permissions, { requireAll });

    return async (
      request: NextRequest,
      userContext?: UserContext,
      ...args: unknown[]
    ): Promise<Response> => {
      if (!userContext) {
        // If no user context provided, try to get it from session
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Authentication required',
              code: 'AUTHENTICATION_REQUIRED',
            }),
            {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        // Extract user from existing auth system
        // This would need to be implemented based on your token validation
        return new Response(
          JSON.stringify({
            success: false,
            error: 'User context not available',
            code: 'USER_CONTEXT_MISSING',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      const middlewareResult = await middleware(request, userContext);

      if ('success' in middlewareResult && middlewareResult.success) {
        return await handler(request, middlewareResult.userContext, ...args);
      } else {
        return middlewareResult as Response;
      }
    };
  };
}

/**
 * Permission checking helpers for inline use
 */
export const PermissionGuards = {
  /**
   * Check user management permissions
   */
  canReadUsers: requirePermissions(['users:read:own', 'users:read:organization', 'users:read:all']),
  canCreateUsers: requirePermissions(['users:create:organization']),
  canUpdateUsers: requirePermissions(['users:update:own', 'users:update:organization']),
  canDeleteUsers: requirePermissions(['users:delete:organization']),
  canManageUsers: requirePermissions(
    ['users:create:organization', 'users:update:organization', 'users:delete:organization'],
    true
  ),

  /**
   * Check practice management permissions
   */
  canReadPractices: requirePermissions(['practices:read:own', 'practices:read:all']),
  canUpdatePractices: requirePermissions(['practices:update:own']),
  canManagePracticeStaff: requirePermissions(['practices:staff:manage:own']),
  canCreatePractices: requirePermissions(['practices:create:all']),
  canManageAllPractices: requirePermissions(['practices:manage:all']),

  /**
   * Check analytics permissions
   */
  canReadAnalytics: requirePermissions(['analytics:read:organization', 'analytics:read:all']),
  canExportAnalytics: requirePermissions(['analytics:export:organization']),

  /**
   * Check role management permissions
   */
  canReadRoles: requirePermissions(['roles:read:organization']),
  canManageRoles: requirePermissions([
    'roles:create:organization',
    'roles:update:organization',
    'roles:delete:organization',
  ]),

  /**
   * Check system administration permissions
   */
  isSuperAdmin: requirePermissions(['users:read:all', 'practices:read:all'], true),
  isOrgAdmin: requirePermissions(['users:create:organization', 'practices:update:own']),

  /**
   * Check settings permissions
   */
  canReadSettings: requirePermissions(['settings:read:organization', 'settings:read:all']),
  canUpdateSettings: requirePermissions(['settings:update:organization', 'settings:update:all']),

  /**
   * Check template permissions
   */
  canReadTemplates: requirePermissions(['templates:read:organization']),
  canManageTemplates: requirePermissions(['templates:manage:all']),

  /**
   * Check API access permissions
   */
  canReadAPI: requirePermissions(['api:read:organization']),
  canWriteAPI: requirePermissions(['api:write:organization']),
};

/**
 * Route protection patterns for common use cases
 */
export const RouteProtection = {
  /**
   * Protect user profile routes
   */
  userProfile: (
    handler: (
      request: NextRequest,
      userContext: UserContext,
      ...args: unknown[]
    ) => Promise<Response>
  ) => requirePermissions('users:read:own')(handler),

  /**
   * Protect user management routes
   */
  userManagement: (
    handler: (
      request: NextRequest,
      userContext: UserContext,
      ...args: unknown[]
    ) => Promise<Response>
  ) => requirePermissions(['users:read:organization', 'users:read:all'])(handler),

  /**
   * Protect practice management routes
   */
  practiceManagement: (
    handler: (
      request: NextRequest,
      userContext: UserContext,
      ...args: unknown[]
    ) => Promise<Response>
  ) => requirePermissions(['practices:read:own', 'practices:read:all'])(handler),

  /**
   * Protect analytics routes
   */
  analytics: (
    handler: (
      request: NextRequest,
      userContext: UserContext,
      ...args: unknown[]
    ) => Promise<Response>
  ) => requirePermissions(['analytics:read:organization', 'analytics:read:all'])(handler),

  /**
   * Protect system administration routes
   */
  systemAdmin: (
    handler: (
      request: NextRequest,
      userContext: UserContext,
      ...args: unknown[]
    ) => Promise<Response>
  ) => requirePermissions(['users:read:all', 'practices:read:all'], true)(handler),

  /**
   * Protect organization administration routes
   */
  orgAdmin: (
    handler: (
      request: NextRequest,
      userContext: UserContext,
      ...args: unknown[]
    ) => Promise<Response>
  ) => requirePermissions(['users:create:organization', 'practices:update:own'])(handler),
};

/**
 * Conditional route protection based on resource ownership
 */
export function protectOwnResource(
  permission: PermissionName,
  resourceIdExtractor: (request: NextRequest) => string | undefined
) {
  return (
    handler: (
      request: NextRequest,
      userContext: UserContext,
      ...args: unknown[]
    ) => Promise<Response>
  ) =>
    requirePermissions([permission])(
      async (request: NextRequest, userContext: UserContext, ...args: unknown[]) => {
        const resourceId = resourceIdExtractor(request);

        // For 'own' scope permissions, verify the resource belongs to the user
        if (permission.endsWith(':own') && resourceId && resourceId !== userContext.user_id) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Forbidden',
              message: 'Can only access your own resources',
              code: 'RESOURCE_ACCESS_DENIED',
            }),
            {
              status: 403,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        return await handler(request, userContext, ...args);
      }
    );
}

/**
 * Helper to create permission-specific route handlers
 */
export const createProtectedRoute = {
  /**
   * User-specific routes with automatic user ID extraction
   */
  forUser:
    (permission: PermissionName | PermissionName[]) =>
    (
      handler: (
        request: NextRequest,
        userContext: UserContext,
        ...args: unknown[]
      ) => Promise<Response>
    ) =>
      rbacRoute(handler, {
        permission,
        extractResourceId: (request: NextRequest) => {
          const pathSegments = request.nextUrl.pathname.split('/');
          const userIndex = pathSegments.findIndex((segment: string) => segment === 'users');
          return userIndex >= 0 && pathSegments[userIndex + 1]
            ? pathSegments[userIndex + 1]
            : undefined;
        },
      }),

  /**
   * Practice-specific routes with automatic practice ID extraction
   */
  forPractice:
    (permission: PermissionName | PermissionName[]) =>
    (
      handler: (
        request: NextRequest,
        userContext: UserContext,
        ...args: unknown[]
      ) => Promise<Response>
    ) =>
      rbacRoute(handler, {
        permission,
        extractResourceId: (request: NextRequest) => {
          const pathSegments = request.nextUrl.pathname.split('/');
          const practiceIndex = pathSegments.findIndex(
            (segment: string) => segment === 'practices'
          );
          return practiceIndex >= 0 && pathSegments[practiceIndex + 1]
            ? pathSegments[practiceIndex + 1]
            : undefined;
        },
      }),

  /**
   * Organization-scoped routes
   */
  forOrganization:
    (permission: PermissionName | PermissionName[]) =>
    (
      handler: (
        request: NextRequest,
        userContext: UserContext,
        ...args: unknown[]
      ) => Promise<Response>
    ) =>
      rbacRoute(handler, {
        permission,
        extractOrganizationId: (request: NextRequest) => {
          return (
            request.nextUrl.searchParams.get('organizationId') ||
            request.headers.get('x-organization-id') ||
            undefined
          );
        },
      }),
};
