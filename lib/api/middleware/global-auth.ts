import type { NextRequest } from 'next/server';
import { log } from '@/lib/logger';
import type { UserContext } from '@/lib/types/rbac';
import { requireAuth } from './auth';
import { applyRateLimit } from './rate-limit';
import { AuthenticationError } from '../responses/error';

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
  '/api/csrf', // ✅ Public endpoint for token generation
  '/api/webhooks/stripe', // ✅ Webhooks don't need CSRF (external)
  '/api/webhooks/resend', // ✅ Webhooks don't need CSRF (external)
  '/api/security/csp-report', // ✅ CSP violation reporting (automated browser requests)
  // Practice website API (public facing)
  '/api/practices/by-domain', // If this exists for public practice sites
]);

// Routes that require public access patterns
const PUBLIC_ROUTE_PATTERNS = [
  /^\/api\/webhooks\//, // Webhook endpoints
  /^\/api\/health/, // Health check endpoints
  // Note: /api/auth/* routes are NOT all public - only specific ones listed in PUBLIC_API_ROUTES
];

/**
 * Check if an API route should be public (no auth required)
 */
export function isPublicApiRoute(pathname: string): boolean {
  // Check exact matches
  if (PUBLIC_API_ROUTES.has(pathname)) {
    return true;
  }

  // Check pattern matches
  return PUBLIC_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));
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
  const pathname = new URL(request.url).pathname;
  const method = request.method;

  // UNIVERSAL RATE LIMITING: Apply to ALL API routes (public and protected)
  // This runs BEFORE authentication to prevent abuse
  // Note: Route wrappers may apply additional rate limits (defense in depth)
  // Exception: /api/auth/me uses session_read rate limit (500/min) instead of auth (20/15min)
  // because it's a high-frequency session verification endpoint, not an authentication endpoint
  const isSessionEndpoint = pathname === '/api/auth/me';
  const rateLimitType = pathname.startsWith('/api/auth/') && !isSessionEndpoint ? 'auth' : 'api';
  await applyRateLimit(request, rateLimitType);

  // Skip auth for public routes
  if (isPublicApiRoute(pathname)) {
    return null; // No auth required
  }

  // Check for Authorization header OR httpOnly cookie (consistent with requireAuth)
  const authHeader = request.headers.get('authorization');
  const cookieHeader = request.headers.get('cookie');

  let hasAuth = false;
  let authMethod = '';

  if (authHeader) {
    hasAuth = true;
    authMethod = 'authorization_header';
  } else if (cookieHeader?.includes('access-token=')) {
    hasAuth = true;
    authMethod = 'httponly_cookie';
  }

  if (!hasAuth) {
    log.security('api_no_auth_credentials', 'low', {
      pathname,
      method,
      hasAuthHeader: !!authHeader,
      hasCookieHeader: !!cookieHeader,
      cookieContainsToken: cookieHeader?.includes('access-token=') || false,
      action: 'returning_401',
    });
    throw AuthenticationError('Access token required');
  }

  // Validate authentication (requireAuth handles both Authorization headers and cookies)
  try {
    const authResult = await requireAuth(request);
    return authResult;
  } catch (error) {
    // Log authentication failure with appropriate severity
    // AuthenticationError from requireAuth indicates auth failure (should be 401)
    const isAuthError = error instanceof Error &&
      (error.name === 'APIError' || error.message.includes('token') ||
       error.message.includes('session') || error.message.includes('User'));

    if (isAuthError) {
      log.security('api_auth_failed', 'medium', {
        pathname,
        method,
        authMethod,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        action: 'returning_401',
      });
    } else {
      log.error(
        'API authentication failed with unexpected error',
        error instanceof Error ? error : new Error(String(error)),
        {
          pathname,
          path: pathname,
          method,
          authMethod,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
        }
      );
    }

    // Re-throw the error - it will be caught by route handlers
    // AuthenticationError from requireAuth will result in 401
    throw error;
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
  const { requireAdmin } = await import('./auth');
  return await requireAdmin(request);
}

/**
 * Get authenticated user from request (convenience function)
 */
export async function getAuthenticatedUser(request: NextRequest) {
  const session = await applyGlobalAuth(request);
  return session?.user || null;
}
