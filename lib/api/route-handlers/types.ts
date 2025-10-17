/**
 * Type Definitions for Route Handlers
 *
 * Core interfaces and types for the composable middleware system.
 * Defines contracts between middleware, pipelines, and route builders.
 */

import type { NextRequest } from 'next/server';
import type { AuthResult } from '@/lib/api/middleware/global-auth';
import type { PermissionName, UserContext } from '@/lib/types/rbac';
import type { TimingTracker } from './utils/timing-tracker';

/**
 * Middleware interface
 *
 * All middleware must implement this interface.
 * Middleware executes sequentially in pipeline with early exit on failure.
 */
export interface Middleware {
  /** Middleware name for logging and debugging */
  name: string;

  /**
   * Execute middleware logic
   *
   * @param request - NextRequest object
   * @param context - Current route context
   * @returns MiddlewareResult with success flag and updated context
   */
  execute(request: NextRequest, context: RouteContext): Promise<MiddlewareResult>;
}

/**
 * Result from middleware execution
 *
 * Success: { success: true, context: updatedContext }
 * Failure: { success: false, response: errorResponse, context?: partialContext }
 */
export interface MiddlewareResult {
  /** Whether middleware succeeded */
  success: boolean;

  /** Updated context (merged into pipeline context) */
  context?: RouteContext;

  /** Error response (if middleware failed) */
  response?: Response;
}

/**
 * Route context accumulated through pipeline
 *
 * Context flows through middleware and accumulates state.
 * Each middleware can read and update context.
 */
export interface RouteContext {
  /** Type of route (determines which middleware run) */
  routeType: 'rbac' | 'public' | 'auth';

  /** Timing tracker for operation durations */
  timingTracker: TimingTracker;

  /** Request start time (milliseconds) */
  startTime: number;

  /** Total duration (computed at end) */
  totalDuration?: number;

  /** Request URL */
  url: URL;

  /** Correlation ID for request tracing */
  correlationId?: string;

  /** User ID (set by auth middleware) */
  userId?: string;

  /** Full user context with RBAC permissions (set by auth middleware) */
  userContext?: UserContext;

  /** Auth session (set by auth middleware) */
  session?: AuthResult;

  /** Whether RBAC permission was denied */
  rbacDenied?: boolean;

  /** Individual operation timings */
  timings?: Record<string, number>;
}

/**
 * Options for RBAC routes
 */
export interface RBACRouteOptions {
  /** Rate limit type */
  rateLimit?: 'auth' | 'api' | 'upload';

  /** Whether authentication is required (default: true) */
  requireAuth?: boolean;

  /** Reason for public route (required if requireAuth is false) */
  publicReason?: string;

  /** RBAC permission(s) required */
  permission?: PermissionName | PermissionName[];

  /** Require ALL permissions (AND logic) vs ANY permission (OR logic) */
  requireAllPermissions?: boolean;

  /** Extract resource ID from request for scope checking */
  extractResourceId?: ((request: NextRequest) => string | undefined) | undefined;

  /** Extract organization ID from request for scope checking */
  extractOrganizationId?: ((request: NextRequest) => string | undefined) | undefined;

  /** Custom handler for permission denied */
  onPermissionDenied?: (userContext: UserContext, deniedPermissions: string[]) => Response;
}

/**
 * Options for public routes (no auth required)
 */
export interface PublicRouteOptions {
  /** Rate limit type */
  rateLimit?: 'auth' | 'api' | 'upload';
}

/**
 * Options for auth routes (auth without RBAC)
 */
export interface AuthRouteOptions {
  /** Rate limit type */
  rateLimit?: 'auth' | 'api' | 'upload';

  /** Whether authentication is required (default: true) */
  requireAuth?: boolean;

  /** Reason for public route (required if requireAuth is false) */
  publicReason?: string;
}

/**
 * RBAC middleware options
 */
export interface RBACMiddlewareOptions {
  /** Require ALL permissions (AND logic) vs ANY permission (OR logic) */
  requireAllPermissions?: boolean;

  /** Extract resource ID from request for scope checking */
  extractResourceId?: ((request: NextRequest) => string | undefined) | undefined;

  /** Extract organization ID from request for scope checking */
  extractOrganizationId?: ((request: NextRequest) => string | undefined) | undefined;
}
