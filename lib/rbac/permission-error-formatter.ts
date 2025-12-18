/**
 * Permission Error Formatter
 *
 * Provides consistent 403 response formatting across all RBAC middleware and services.
 * Centralizes permission denied response structure for maintainability.
 *
 * Usage:
 * ```typescript
 * import { PermissionErrorFormatter, createPermissionDeniedResponse } from '@/lib/rbac/permission-error-formatter';
 *
 * // In middleware
 * return createPermissionDeniedResponse({
 *   requiredPermissions: ['users:read:all'],
 *   deniedPermissions: ['users:read:all'],
 *   userId: userContext.user_id,
 *   request,
 * });
 *
 * // Or use the formatter directly
 * const body = PermissionErrorFormatter.formatDeniedResponse({...});
 * return new Response(JSON.stringify(body), { status: 403 });
 * ```
 */

import { NextResponse } from 'next/server';
import type { PermissionName } from '@/lib/types/rbac';

/**
 * Permission denied response body structure
 */
export interface PermissionDeniedBody {
  success: false;
  error: string;
  message: string;
  code: string;
  details: {
    required_permissions: PermissionName[];
    denied_permissions: PermissionName[];
    user_id: string;
    resource_id?: string;
    organization_id?: string;
  };
  meta: {
    timestamp: string;
    path?: string;
  };
}

/**
 * Options for creating permission denied responses
 */
export interface PermissionDeniedOptions {
  /** Permissions that were required */
  requiredPermissions: PermissionName[];
  /** Permissions that were denied (may be subset of required for AND logic) */
  deniedPermissions: PermissionName[];
  /** User ID for audit trail */
  userId: string;
  /** Resource ID being accessed (optional) */
  resourceId?: string | undefined;
  /** Organization ID context (optional) */
  organizationId?: string | undefined;
  /** Whether all permissions were required (affects message) */
  requireAll?: boolean | undefined;
  /** Request URL for path in response */
  requestUrl?: string | undefined;
}

/**
 * PermissionErrorFormatter - Centralized permission error response formatting
 */
export const PermissionErrorFormatter = {
  /**
   * Default error message for permission denied
   */
  DEFAULT_ERROR: 'Forbidden',

  /**
   * Default error code for permission denied
   */
  DEFAULT_CODE: 'INSUFFICIENT_PERMISSIONS',

  /**
   * Format a permission denied response body
   *
   * @param options - Permission denied options
   * @returns Structured response body
   */
  formatDeniedResponse(options: PermissionDeniedOptions): PermissionDeniedBody {
    const {
      requiredPermissions,
      deniedPermissions,
      userId,
      resourceId,
      organizationId,
      requireAll = false,
      requestUrl,
    } = options;

    const connector = requireAll ? ' and ' : ' or ';
    const message = `Missing required permissions: ${deniedPermissions.join(connector)}`;

    return {
      success: false,
      error: this.DEFAULT_ERROR,
      message,
      code: this.DEFAULT_CODE,
      details: {
        required_permissions: requiredPermissions,
        denied_permissions: deniedPermissions,
        user_id: userId,
        ...(resourceId && { resource_id: resourceId }),
        ...(organizationId && { organization_id: organizationId }),
      },
      meta: {
        timestamp: new Date().toISOString(),
        ...(requestUrl && { path: requestUrl }),
      },
    };
  },

  /**
   * Create a NextResponse for permission denied
   *
   * @param options - Permission denied options
   * @returns NextResponse with 403 status
   */
  createNextResponse(options: PermissionDeniedOptions): NextResponse {
    const body = this.formatDeniedResponse(options);
    return NextResponse.json(body, { status: 403 });
  },

  /**
   * Create a standard Response for permission denied
   *
   * @param options - Permission denied options
   * @returns Response with 403 status
   */
  createResponse(options: PermissionDeniedOptions): Response {
    const body = this.formatDeniedResponse(options);
    return new Response(JSON.stringify(body), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  },

  /**
   * Format from RBAC error for consistency with thrown errors
   *
   * @param error - RBACError or similar error with code and details
   * @param requestUrl - Optional request URL for path
   * @returns Structured response body
   */
  formatFromError(
    error: { message: string; code: string; statusCode: number; details?: unknown },
    requestUrl?: string
  ): {
    success: false;
    error: string;
    code: string;
    details?: unknown;
    meta: { timestamp: string; path?: string };
  } {
    return {
      success: false,
      error: error.message,
      code: error.code,
      details: error.details,
      meta: {
        timestamp: new Date().toISOString(),
        ...(requestUrl && { path: requestUrl }),
      },
    };
  },
} as const;

/**
 * Convenience function for creating permission denied responses
 *
 * @param options - Permission denied options with optional request
 * @returns NextResponse with 403 status
 */
export function createPermissionDeniedResponse(
  options: PermissionDeniedOptions & { request?: Request }
): NextResponse {
  const { request, ...rest } = options;
  return PermissionErrorFormatter.createNextResponse({
    ...rest,
    ...(request?.url && { requestUrl: request.url }),
  });
}

/**
 * Type guard to check if an error is a permission denied error
 */
export function isPermissionDeniedError(
  error: unknown
): error is { code: 'INSUFFICIENT_PERMISSIONS' | 'PERMISSION_DENIED' } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'INSUFFICIENT_PERMISSIONS' || error.code === 'PERMISSION_DENIED')
  );
}
