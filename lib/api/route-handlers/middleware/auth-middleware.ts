/**
 * Authentication Middleware
 *
 * Validates user authentication using JWT tokens or cookies.
 * Retrieves full user context with RBAC permissions from session.
 *
 * Extracted from:
 * - rbacRoute lines 88-123
 * - authRoute lines 477-515
 *
 * Features:
 * - Optional authentication (skip if requireAuth is false)
 * - Delegates to applyGlobalAuth() for actual auth
 * - Retrieves userContext from session (cached from applyGlobalAuth)
 * - Automatic timing tracking
 * - Returns 401 if auth required but no valid session
 *
 * Usage:
 * ```typescript
 * const middleware = new AuthMiddleware(true);
 * const result = await middleware.execute(request, context);
 * // context.session and context.userContext now set
 * ```
 */

import type { NextRequest } from 'next/server';
import { applyGlobalAuth, markAsPublicRoute } from '@/lib/api/middleware/global-auth';
import { createErrorResponse } from '@/lib/api/responses/error';
import { log } from '@/lib/logger';
import type { Middleware, MiddlewareResult, RouteContext } from '../types';

export class AuthMiddleware implements Middleware {
  name = 'auth';

  constructor(
    private requireAuth: boolean = true,
    private publicReason?: string
  ) {}

  async execute(request: NextRequest, context: RouteContext): Promise<MiddlewareResult> {
    // Skip authentication for public routes
    if (!this.requireAuth) {
      if (this.publicReason) {
        markAsPublicRoute(this.publicReason);
        log.debug('Route marked as public', {
          reason: this.publicReason,
        });
      }

      return { success: true, context };
    }

    // Apply authentication
    const endTiming = context.timingTracker.start('auth');
    const session = await applyGlobalAuth(request);
    endTiming();

    log.info('Global auth check completed', {
      duration: context.timingTracker.getTiming('auth'),
    });

    log.debug('Global authentication completed', {
      hasSession: !!session,
      hasUser: !!session?.user?.id,
    });

    // Verify session and user exist
    if (!session?.user?.id) {
      log.warn('Authentication failed - no user session', {
        hasSession: !!session,
        sessionKeys: session ? Object.keys(session) : [],
      });

      log.security('auth_failed', 'medium', {
        reason: 'no_user_session',
        action: 'authentication_check',
      });

      log.auth('auth_check', false, {
        reason: 'no_user_session',
      });

      return {
        success: false,
        response: createErrorResponse('Authentication required', 401, request) as Response,
      };
    }

    // Success - extract userContext from session
    // applyGlobalAuth() already fetched this to avoid redundant DB queries
    const userContext = session.userContext;

    if (!userContext) {
      log.error('User context missing from session', undefined, {
        userId: session.user.id,
        sessionEmail: session.user.email,
        sessionKeys: Object.keys(session),
      });

      log.security('auth_context_missing', 'high', {
        userId: session.user.id,
        reason: 'context_not_in_session',
        alert: 'This should not happen - investigate applyGlobalAuth()',
      });

      return {
        success: false,
        response: createErrorResponse(
          'Failed to load user context - authentication state invalid',
          500,
          request
        ) as Response,
      };
    }

    log.debug('User context loaded successfully', {
      userId: userContext.user_id,
      organizationId: userContext.current_organization_id,
      roleCount: userContext.roles?.length || 0,
      permissionCount: userContext.all_permissions?.length || 0,
      isSuperAdmin: userContext.is_super_admin,
    });

    log.auth('auth_success', true, { userId: session.user.id });

    // Return updated context with session and userContext
    return {
      success: true,
      context: {
        ...context,
        session,
        userId: session.user.id,
        userContext,
      },
    };
  }
}
