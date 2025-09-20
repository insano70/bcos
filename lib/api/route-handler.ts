import type { NextRequest } from 'next/server'
import { applyRateLimit } from './middleware/rate-limit'
import { applyGlobalAuth, markAsPublicRoute } from './middleware/global-auth'
import { createErrorResponse } from './responses/error'

// Type for the authentication session (matches AuthResult from global-auth.ts)
interface AuthSession {
  user: {
    id: string;
    email: string | null;
    name: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
    emailVerified: boolean | null;
    practiceId: string | null;
    roles: string[];
    permissions: string[];
    isSuperAdmin: boolean;
    organizationAdminFor: string[];
  };
  accessToken: string;
  sessionId: string;
  userContext: unknown;
}

/**
 * Secure API Route Handler Wrapper
 * Automatically applies rate limiting and authentication to all routes
 */

interface RouteOptions {
  rateLimit?: 'auth' | 'api' | 'upload'
  requireAuth?: boolean
  publicReason?: string // Required if requireAuth is false
}

/**
 * Wrap an API route handler with automatic security
 */
export function secureRoute(
  handler: (request: NextRequest, session?: AuthSession, ...args: unknown[]) => Promise<Response>,
  options: RouteOptions = { requireAuth: true, rateLimit: 'api' }
) {
  return async (request: NextRequest, ...args: unknown[]): Promise<Response> => {
    try {
      // 1. Apply rate limiting
      if (options.rateLimit) {
        await applyRateLimit(request, options.rateLimit)
      }
      
      // 2. Apply authentication (unless explicitly public)
      let session = null
      if (options.requireAuth !== false) {
        session = await applyGlobalAuth(request)
      } else if (options.publicReason) {
        markAsPublicRoute(options.publicReason)
      }
      
      // 3. Call the actual handler
      return await handler(request, session, ...args)
      
    } catch (error) {
      console.error(`API route error [${request.method} ${new URL(request.url).pathname}]:`, error)
      return createErrorResponse(
        error instanceof Error ? error : 'Unknown error', 
        500, 
        request
      )
    }
  }
}

/**
 * Create a public API route (no authentication required)
 */
export function publicRoute(
  handler: (request: NextRequest, ...args: unknown[]) => Promise<Response>,
  reason: string,
  options: Omit<RouteOptions, 'requireAuth' | 'publicReason'> = {}
) {
  return secureRoute(handler, {
    ...options,
    requireAuth: false,
    publicReason: reason
  })
}

/**
 * Create an admin-only API route
 */
export function adminRoute(
  handler: (request: NextRequest, session: AuthSession, ...args: unknown[]) => Promise<Response>,
  options: Omit<RouteOptions, 'requireAuth'> = {}
) {
  return secureRoute(async (request: NextRequest, session: AuthSession, ...args: unknown[]) => {
    // Additional admin check
    if (session?.user?.role !== 'admin') {
      return createErrorResponse('Admin access required', 403, request)
    }
    return await handler(request, session, ...args)
  }, {
    ...options,
    requireAuth: true
  })
}

