/**
 * Route Handlers - Clean Public API
 *
 * Composable middleware-based route handlers for Next.js API routes.
 * Replaces the monolithic rbac-route-handler.ts with clean, testable architecture.
 *
 * Route Types:
 * - rbacRoute: RBAC permission-based routes (most routes)
 * - publicRoute: No authentication required (health checks, etc.)
 * - authRoute: Authentication without RBAC (MFA/auth system routes)
 *
 * Usage:
 * ```typescript
 * import { rbacRoute, publicRoute, authRoute } from '@/lib/api/route-handlers';
 *
 * // RBAC-protected route
 * export const GET = rbacRoute(handler, {
 *   permission: 'users:read:all',
 *   rateLimit: 'api',
 * });
 *
 * // Public route
 * export const GET = publicRoute(handler, 'Health check endpoint', {
 *   rateLimit: 'api',
 * });
 *
 * // Auth route (without RBAC)
 * export const GET = authRoute(handler, {
 *   rateLimit: 'api',
 * });
 * ```
 */

import type { NextRequest } from 'next/server';
import type { PermissionName, UserContext } from '@/lib/types/rbac';
import type { AuthSession } from '@/lib/api/route-handler';
import { RBACRouteBuilder } from './builders/rbac-route-builder';
import { PublicRouteBuilder } from './builders/public-route-builder';
import { AuthRouteBuilder } from './builders/auth-route-builder';

// Re-export types
export type {
  RBACRouteOptions,
  PublicRouteOptions,
  AuthRouteOptions,
  RouteContext,
  MiddlewareResult,
  Middleware,
} from './types';

/**
 * RBAC Route Handler
 *
 * Secure route with RBAC permission checking.
 * Validates user has required permissions before calling handler.
 *
 * @param handler - Route handler receiving userContext
 * @param options - RBAC options (permission, rateLimit, resource extraction)
 * @returns Next.js route handler function
 *
 * @example
 * ```typescript
 * export const GET = rbacRoute(
 *   async (request, userContext) => {
 *     // Handler logic with userContext
 *     return NextResponse.json({ data });
 *   },
 *   {
 *     permission: 'users:read:all',
 *     rateLimit: 'api',
 *   }
 * );
 * ```
 */
export function rbacRoute(
  handler: (
    request: NextRequest,
    userContext: UserContext,
    ...args: unknown[]
  ) => Promise<Response>,
  options: {
    permission: PermissionName | PermissionName[];
    rateLimit?: 'auth' | 'api' | 'upload';
    requireAuth?: boolean;
    publicReason?: string;
    requireAllPermissions?: boolean;
    extractResourceId?: ((request: NextRequest) => string | undefined) | undefined;
    extractOrganizationId?: ((request: NextRequest) => string | undefined) | undefined;
    onPermissionDenied?: (userContext: UserContext, deniedPermissions: string[]) => Response;
  }
) {
  return RBACRouteBuilder.build(handler, options);
}

/**
 * Public Route Handler
 *
 * Route without authentication required.
 * Still applies rate limiting.
 *
 * @param handler - Route handler (no userContext)
 * @param reason - Reason for public access (documentation)
 * @param options - Public route options (rateLimit)
 * @returns Next.js route handler function
 *
 * @example
 * ```typescript
 * export const GET = publicRoute(
 *   async (request) => {
 *     // Handler logic without auth
 *     return NextResponse.json({ status: 'ok' });
 *   },
 *   'Health check endpoint',
 *   { rateLimit: 'api' }
 * );
 * ```
 */
export function publicRoute(
  handler: (request: NextRequest, ...args: unknown[]) => Promise<Response>,
  reason: string,
  options: {
    rateLimit?: 'auth' | 'api' | 'upload';
  } = {}
) {
  return PublicRouteBuilder.build(handler, reason, options);
}

/**
 * Auth Route Handler
 *
 * Authenticated route without RBAC permission checking.
 * Handler receives session object instead of userContext.
 * Used by MFA/auth system routes that don't fit RBAC model.
 *
 * @param handler - Route handler receiving session
 * @param options - Auth route options (rateLimit, requireAuth)
 * @returns Next.js route handler function
 *
 * @example
 * ```typescript
 * export const GET = authRoute(
 *   async (request, session) => {
 *     // Handler logic with session
 *     const userId = session?.user.id;
 *     return NextResponse.json({ data });
 *   },
 *   { rateLimit: 'api' }
 * );
 * ```
 */
export function authRoute(
  handler: (
    request: NextRequest,
    session?: AuthSession,
    ...args: unknown[]
  ) => Promise<Response>,
  options: {
    rateLimit?: 'auth' | 'api' | 'upload';
    requireAuth?: boolean;
    publicReason?: string;
  } = {}
) {
  return AuthRouteBuilder.build(handler, options);
}

/**
 * Legacy alias for backward compatibility
 * @deprecated Use authRoute instead
 */
export const legacySecureRoute = authRoute;

/**
 * Legacy alias for backward compatibility
 * @deprecated Use authRoute instead
 */
export const secureRoute = authRoute;
