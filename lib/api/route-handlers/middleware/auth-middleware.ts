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
 * SECURITY:
 * - All authentication failures return 401 to trigger client-side login redirect
 * - 500 errors are reserved for actual server failures (DB down, etc.)
 * - Auth failures are logged as security events for monitoring
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
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
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

    // Track timing breakdown for performance analysis
    const breakdown: Record<string, number> = {};

    // Apply authentication
    const endTiming = context.timingTracker.start('auth');
    const t1 = Date.now();
    const session = await applyGlobalAuth(request);
    breakdown.globalAuth = Date.now() - t1;
    endTiming();

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
    const t2 = Date.now();
    const userContext = session.userContext;
    breakdown.contextExtract = Date.now() - t2;

    if (!userContext) {
      // SECURITY: This is an authentication failure, not a server error
      // The token validated but the user context could not be loaded, indicating:
      // - User was deleted/deactivated after token was issued
      // - Session was invalidated server-side
      // - Database inconsistency between token and user records
      //
      // Return 401 to trigger client-side login redirect
      log.warn('User context missing from session - treating as auth failure', {
        userId: session.user.id,
        sessionEmail: session.user.email,
        sessionId: session.sessionId,
        operation: 'auth_middleware',
        component: 'auth',
      });

      log.security('session_context_invalid', 'medium', {
        userId: session.user.id,
        sessionId: session.sessionId,
        reason: 'context_not_loaded',
        action: 'returning_401_for_login_redirect',
      });

      return {
        success: false,
        response: createErrorResponse(
          'Session invalid - please sign in again',
          401,
          request
        ) as Response,
      };
    }

    // Log single comprehensive auth success with breakdown timing
    const authDuration = context.timingTracker.getTiming('auth') || 0;
    log.auth('auth_success', true, {
      userId: session.user.id,
      duration: authDuration,
      breakdown,
      slow: authDuration > SLOW_THRESHOLDS.AUTH_OPERATION,
    });

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
