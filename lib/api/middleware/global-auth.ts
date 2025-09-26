import type { NextRequest } from 'next/server'
import { requireAuth } from './auth'
import { cookies } from 'next/headers'
import { loggers } from '@/lib/logger'
import type { UserContext } from '@/lib/types/rbac'

/**
 * Global API Authentication Middleware
 * Protects ALL API routes by default unless explicitly marked as public
 */

// Public API routes that don't require authentication
const PUBLIC_API_ROUTES = new Set([
  '/api/health',
  '/api/health/db',
  '/api/health/services',
  '/api/auth/login', // ✅ Needs CSRF protection despite being public
  '/api/auth/logout', // ✅ Logout needs to be accessible even when not authenticated
  '/api/auth/refresh', // ✅ Token refresh needs cookie-based auth
  '/api/csrf',       // ✅ Public endpoint for token generation
  '/api/webhooks/stripe', // ✅ Webhooks don't need CSRF (external)
  '/api/webhooks/resend', // ✅ Webhooks don't need CSRF (external)
  '/api/security/csp-report', // ✅ CSP violation reporting (automated browser requests)
  // Practice website API (public facing)
  '/api/practices/by-domain', // If this exists for public practice sites
])

// Routes that require public access patterns
const PUBLIC_ROUTE_PATTERNS = [
  /^\/api\/webhooks\//,     // Webhook endpoints
  /^\/api\/auth\//,         // Authentication endpoints  
  /^\/api\/health/,         // Health check endpoints
]

/**
 * Check if an API route should be public (no auth required)
 */
export function isPublicApiRoute(pathname: string): boolean {
  // Check exact matches
  if (PUBLIC_API_ROUTES.has(pathname)) {
    return true
  }
  
  // Check pattern matches
  return PUBLIC_ROUTE_PATTERNS.some(pattern => pattern.test(pathname))
}

/**
 * Check if refresh token cookie exists (for debugging purposes only)
 */
async function _checkRefreshTokenCookie(): Promise<boolean> {
  try {
    const cookieStore = await cookies()
    const refreshToken = cookieStore.get('refresh-token')?.value
    return !!refreshToken
  } catch (_error) {
    return false
  }
}

/**
 * Apply global authentication to API routes
 * Call this at the start of every API route handler
 */
// Type for the authentication result
export interface AuthResult {
  user: {
    id: string;
    email: string | null;
    name: string;
    firstName: string | null;
    lastName: string | null;
    role: string | undefined;
    emailVerified: boolean | null;
    practiceId: string | null | undefined;
    roles: string[];
    permissions: string[];
    isSuperAdmin: boolean;
    organizationAdminFor: string[];
  };
  accessToken: string;
  sessionId: string;
  userContext: UserContext | null; // Full RBAC context
}

export async function applyGlobalAuth(request: NextRequest): Promise<AuthResult | null> {
  const pathname = new URL(request.url).pathname
  const logger = loggers.auth.child({ path: pathname, method: request.method })

  logger.debug('API auth check initiated', { pathname })

  // Skip auth for public routes
  if (isPublicApiRoute(pathname)) {
    logger.debug('Public API route detected, no auth required', { pathname })
    return null // No auth required
  }

  // Check for Authorization header OR httpOnly cookie (consistent with requireAuth)
  const authHeader = request.headers.get('authorization')
  const cookieHeader = request.headers.get('cookie')
  
  let hasAuth = false
  let authMethod = ''
  
  if (authHeader) {
    hasAuth = true
    authMethod = 'authorization_header'
    logger.debug('Using Authorization header for authentication', { pathname })
  } else if (cookieHeader?.includes('access-token=')) {
    hasAuth = true
    authMethod = 'httponly_cookie'
    logger.debug('Using httpOnly cookie for authentication', { pathname })
  }

  if (!hasAuth) {
    logger.warn('API authentication failed - no valid auth method', { 
      pathname,
      hasAuthHeader: !!authHeader,
      hasCookieHeader: !!cookieHeader,
      cookieContainsToken: cookieHeader?.includes('access-token=') || false
    })
    throw new Error(`Authentication required for ${pathname}: Access token required`)
  }

  // Validate authentication (requireAuth handles both Authorization headers and cookies)
  try {
    const startTime = Date.now()
    const authResult = await requireAuth(request)
    const duration = Date.now() - startTime
    
    logger.info('API authentication successful', { 
      pathname,
      userId: authResult.user.id,
      userEmail: authResult.user.email?.replace(/(.{2}).*@/, '$1***@'), // Mask email
      authMethod,
      duration
    })
    
    return authResult
  } catch (error) {
    logger.error('API authentication failed', error, { 
      pathname,
      authMethod,
      errorType: error instanceof Error ? error.constructor.name : typeof error
    })
    throw new Error(`Authentication required for ${pathname}: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Mark a route as public (for explicit documentation)
 * This is a no-op function for clarity in route handlers
 */
export function markAsPublicRoute(_reason: string): void {
  // This function exists for documentation purposes
  // Usage: markAsPublicRoute('Health check endpoint')
}

/**
 * Require admin role for sensitive operations
 */
export async function requireAdminAuth(request: NextRequest) {
  const { requireAdmin } = await import('./auth')
  return await requireAdmin(request)
}

/**
 * Get authenticated user from request (convenience function)
 */
export async function getAuthenticatedUser(request: NextRequest) {
  const session = await applyGlobalAuth(request)
  return session?.user || null
}

