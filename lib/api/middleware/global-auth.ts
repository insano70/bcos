import type { NextRequest } from 'next/server'
import { requireAuth } from './auth'

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
  '/api/csrf',       // ✅ Public endpoint for token generation
  '/api/webhooks/stripe', // ✅ Webhooks don't need CSRF (external)
  '/api/webhooks/resend', // ✅ Webhooks don't need CSRF (external)
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
 * Apply global authentication to API routes
 * Call this at the start of every API route handler
 */
export async function applyGlobalAuth(request: NextRequest): Promise<any> {
  const pathname = new URL(request.url).pathname
  
  // Skip auth for public routes
  if (isPublicApiRoute(pathname)) {
    return null // No auth required
  }
  
  // Require authentication for all other API routes
  try {
    return await requireAuth(request)
  } catch (error) {
    // Re-throw with additional context
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

