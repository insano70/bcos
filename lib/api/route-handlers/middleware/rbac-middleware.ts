/**
 * RBAC Middleware
 *
 * Validates user has required RBAC permissions to access resource.
 * Delegates to existing createRBACMiddleware() with timing tracking.
 *
 * Extracted from:
 * - rbacRoute lines 228-347
 *
 * Features:
 * - Permission checking with AND/OR logic
 * - Resource and organization scoping
 * - Automatic timing tracking
 * - Detailed logging for permission checks
 * - Returns 403 if permission denied
 *
 * Usage:
 * ```typescript
 * const middleware = new RBACMiddleware('users:read:all', {
 *   requireAllPermissions: false,
 *   extractResourceId: extractUserId,
 * });
 * const result = await middleware.execute(request, context);
 * // Permission checked, context.userContext updated
 * ```
 */

import type { NextRequest } from 'next/server';
import { createRBACMiddleware } from '@/lib/rbac/middleware';
import type { PermissionName } from '@/lib/types/rbac';
import { log } from '@/lib/logger';
import type { Middleware, MiddlewareResult, RouteContext, RBACMiddlewareOptions } from '../types';

export class RBACMiddleware implements Middleware {
  name = 'rbac';

  constructor(
    private permission: PermissionName | PermissionName[],
    private options: RBACMiddlewareOptions = {}
  ) {}

  async execute(request: NextRequest, context: RouteContext): Promise<MiddlewareResult> {
    // Require userContext from auth middleware
    if (!context.userContext) {
      log.error('RBAC middleware called without userContext', undefined, {
        userId: context.userId,
        hasSession: !!context.session,
      });

      return {
        success: false,
        response: new Response(
          JSON.stringify({
            success: false,
            error: 'Internal Server Error',
            message: 'User context required for RBAC',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        ),
      };
    }

    // Apply RBAC permission check
    const endTiming = context.timingTracker.start('rbac');

    const rbacMiddleware = createRBACMiddleware(this.permission, {
      requireAll: this.options.requireAllPermissions,
      extractResourceId: this.options.extractResourceId,
      extractOrganizationId: this.options.extractOrganizationId,
    });

    const rbacResult = await rbacMiddleware(request, context.userContext);
    endTiming();

    const rbacDuration = context.timingTracker.getTiming('rbac');

    log.info('RBAC permission check completed', {
      duration: rbacDuration,
      userId: context.userContext.user_id,
      permissions: Array.isArray(this.permission) ? this.permission : [this.permission],
      requireAll: this.options.requireAllPermissions || false,
    });

    // Check if permission granted
    if ('success' in rbacResult && rbacResult.success) {
      log.info('RBAC permission check passed', {
        userId: context.userContext.user_id,
        permissions: Array.isArray(this.permission) ? this.permission : [this.permission],
        rbacDuration,
      });

      log.auth('rbac_check', true, {
        userId: context.userContext.user_id,
      });

      // Return updated context with refreshed userContext
      return {
        success: true,
        context: {
          ...context,
          userContext: rbacResult.userContext,
        },
      };
    }

    // Permission denied
    log.warn('RBAC permission denied', {
      userId: context.userContext.user_id,
      requiredPermissions: Array.isArray(this.permission) ? this.permission : [this.permission],
      userPermissions: context.userContext.all_permissions?.map((p) => p.name) || [],
      rbacDuration,
    });

    log.security('rbac_permission_denied', 'medium', {
      userId: context.userContext.user_id,
      action: 'permission_check',
      reason: 'insufficient_permissions',
    });

    log.auth('rbac_check', false, {
      userId: context.userContext.user_id,
      reason: 'permission_denied',
    });

    // Return RBAC error response with rbacDenied flag
    return {
      success: false,
      response: rbacResult as Response,
      context: {
        ...context,
        rbacDenied: true,
      },
    };
  }
}
