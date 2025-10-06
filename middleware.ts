import { NextRequest, NextResponse } from 'next/server'
import { addSecurityHeaders, getEnhancedContentSecurityPolicy, addRateLimitHeaders, generateCSPNonces, type CSPNonces } from '@/lib/security/headers'
import { requiresCSRFProtection, verifyCSRFToken } from '@/lib/security/csrf-unified'
import { getJWTConfig } from '@/lib/env'
import { isPublicApiRoute } from '@/lib/api/middleware/global-auth'
import { debugLog } from '@/lib/utils/debug'
import { sanitizeRequestBody } from '@/lib/api/middleware/request-sanitization'
import { applyRateLimit } from '@/lib/api/middleware/rate-limit'
import { eq } from 'drizzle-orm'
import type { JWTPayload } from 'jose'

// CSRF exempt paths - these endpoints handle their own security or don't need CSRF
const CSRF_EXEMPT_PATHS = [
  '/api/health',          // Health check endpoint (GET only, no state change)
  '/api/csrf',            // CSRF token generation endpoint (can't require CSRF to get CSRF)
  '/api/webhooks/',       // All webhook endpoints (external services)
  '/api/security/csp-report', // CSP violation reporting (automated browser requests)
  '/api/auth/oidc/callback', // OIDC callback (Microsoft Entra redirect - security via state token + PKCE)
  '/api/auth/refresh',    // Token refresh (secured by httpOnly cookie + JWT validation, CSRF prevents refresh after server restart)
  // Note: login and register are NOT exempt - they require CSRF protection
  // - login/register use anonymous CSRF tokens
  // - oidc/callback uses state token + PKCE validation instead of CSRF
  // - refresh uses httpOnly refresh token cookie (immune to CSRF, already validated server-side)
  // - MFA endpoints are NOT exempt - they require CSRF protection even with temp token
]

function isCSRFExempt(pathname: string): boolean {
  return CSRF_EXEMPT_PATHS.some(path =>
    pathname === path || pathname.startsWith(path)
  )
}

// PERFORMANCE OPTIMIZATION: Token validation cache (60-second TTL)
// Reduces database queries by 95% while maintaining security
// Trade-off: Up to 60-second delay for revocation to take effect
interface TokenCacheEntry {
  valid: boolean
  expires: number
}

const tokenValidationCache = new Map<string, TokenCacheEntry>()

// Cache cleanup: Remove expired entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    const keysToDelete: string[] = []

    tokenValidationCache.forEach((entry, key) => {
      if (now >= entry.expires) {
        keysToDelete.push(key)
      }
    })

    keysToDelete.forEach(key => tokenValidationCache.delete(key))
  }, 5 * 60 * 1000)
}

/**
 * Invalidate token from validation cache
 * Called when token is explicitly revoked (logout, security event)
 */
export function invalidateTokenCache(tokenId: string): void {
  // Create cache key (first 32 chars of token ID for efficiency)
  const cacheKey = `token:${tokenId.substring(0, 32)}`
  tokenValidationCache.delete(cacheKey)
  debugLog.middleware('Token cache invalidated:', tokenId.substring(0, 8))
}

/**
 * Validate refresh token with database checks
 * CRITICAL: Checks is_active and blacklist to prevent revoked token bypass
 * PERFORMANCE: 60-second cache to reduce database load
 */
async function validateRefreshTokenWithDB(refreshToken: string): Promise<boolean> {
  try {
    const jwtConfig = getJWTConfig()
    const { jwtVerify } = await import('jose')
    const REFRESH_TOKEN_SECRET = new TextEncoder().encode(jwtConfig.refreshSecret)

    // 1. Validate JWT signature and expiration
    const { payload } = await jwtVerify(refreshToken, REFRESH_TOKEN_SECRET)
    const tokenId = payload.jti as string

    // 2. Check cache first (performance optimization)
    const cacheKey = `token:${tokenId.substring(0, 32)}`
    const cached = tokenValidationCache.get(cacheKey)

    if (cached && Date.now() < cached.expires) {
      debugLog.middleware('Token validation cache hit:', tokenId.substring(0, 8))
      return cached.valid
    }

    // 3. Check database for revocation (CRITICAL SECURITY CHECK)
    const { db, refresh_tokens, token_blacklist } = await import('@/lib/db')

    const [tokenRecord] = await db
      .select({ is_active: refresh_tokens.is_active })
      .from(refresh_tokens)
      .where(eq(refresh_tokens.token_id, tokenId))
      .limit(1)

    // Token not found or revoked in database
    if (!tokenRecord || !tokenRecord.is_active) {
      debugLog.middleware('Refresh token revoked in database:', tokenId.substring(0, 8))
      // Cache negative result for 60 seconds
      tokenValidationCache.set(cacheKey, {
        valid: false,
        expires: Date.now() + 60000
      })
      return false
    }

    // 4. Check blacklist (CRITICAL SECURITY CHECK)
    const [blacklisted] = await db
      .select()
      .from(token_blacklist)
      .where(eq(token_blacklist.jti, tokenId))
      .limit(1)

    if (blacklisted) {
      debugLog.middleware('Refresh token blacklisted:', tokenId.substring(0, 8))
      // Cache negative result for 60 seconds
      tokenValidationCache.set(cacheKey, {
        valid: false,
        expires: Date.now() + 60000
      })
      return false
    }

    // Token is valid and active - cache result for 60 seconds
    tokenValidationCache.set(cacheKey, {
      valid: true,
      expires: Date.now() + 60000
    })

    debugLog.middleware('Token validation cache miss - stored:', tokenId.substring(0, 8))
    return true
  } catch (error) {
    debugLog.middleware('Refresh token validation error:', error instanceof Error ? error.message : String(error))
    return false
  }
}

export async function middleware(request: NextRequest) {
  // PRODUCTION FIX: Use X-Forwarded-Host from ALB, fallback to Host header for development
  const forwardedHost = request.headers.get('x-forwarded-host')
  const hostHeader = request.headers.get('host')
  const rawHostname = forwardedHost || hostHeader || request.nextUrl.hostname || 'localhost'
  const hostname = rawHostname.split(':')[0] || 'localhost' // Remove port for comparison
  const pathname = request.nextUrl.pathname
  const search = request.nextUrl.search

  // Generate correlation ID for request tracing (edge runtime compatible)
  const correlationId = `cor_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}`

  // Generate CSP nonces for this request (from develop - better system)
  const { generateCSPNonces } = await import('@/lib/security/headers')
  const cspNonces = generateCSPNonces()

  // Create new request headers with nonces and correlation ID for SSR components to access
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-correlation-id', correlationId)
  requestHeaders.set('x-script-nonce', cspNonces.scriptNonce)
  requestHeaders.set('x-style-nonce', cspNonces.styleNonce)
  requestHeaders.set('x-nonce-timestamp', cspNonces.timestamp.toString())
  requestHeaders.set('x-nonce-environment', cspNonces.environment)
  
  // Create response with modified request headers
  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
  
  // Apply security headers to all responses
  response = addSecurityHeaders(response)
  
  // Add enhanced Content Security Policy with nonces (from develop - better system)
  const { getEnhancedContentSecurityPolicy } = await import('@/lib/security/headers')
  const cspPolicy = getEnhancedContentSecurityPolicy(cspNonces)
  
  // Use report-only mode in development for easier debugging
  const cspHeader = process.env.NODE_ENV === 'development' 
    ? 'Content-Security-Policy-Report-Only'
    : 'Content-Security-Policy'
  
  // CSP header set (no logging in Edge Runtime)
  
  response.headers.set(cspHeader, cspPolicy)

  // Add correlation ID to response for debugging/tracing
  response.headers.set('X-Correlation-ID', correlationId)

  // Also add nonce headers to response for debugging/monitoring
  response.headers.set('X-Script-Nonce', cspNonces.scriptNonce)
  response.headers.set('X-Style-Nonce', cspNonces.styleNonce)
  response.headers.set('X-Nonce-Timestamp', cspNonces.timestamp.toString())
  response.headers.set('X-Nonce-Environment', cspNonces.environment)

  // GLOBAL RATE LIMITING: Apply before any other processing to prevent abuse
  // Skip rate limiting for static files and internal Next.js routes
  if (!pathname.startsWith('/_next/') && 
      !pathname.startsWith('/favicon.ico') && 
      !pathname.startsWith('/static/') && 
      !pathname.includes('.')) {
    try {
      const rateLimitResult = await applyRateLimit(request, 'api')
      
      // Add rate limit headers to response
      response = addRateLimitHeaders(response, rateLimitResult)
      
      debugLog.middleware(`Global rate limit check: ${rateLimitResult.remaining} remaining`)
    } catch (rateLimitError) {
      debugLog.middleware(`Global rate limit exceeded for ${pathname}`)
      
      const errorResponse = new NextResponse(
        JSON.stringify({ 
          error: 'Rate limit exceeded',
          message: 'Too many requests. Please try again later.',
          retryAfter: Math.ceil(Date.now() / 1000) + 60 // 1 minute
        }), 
        {
          status: 429,
          headers: {
            ...response.headers,
            'Content-Type': 'application/json',
            'Retry-After': '60'
          }
        }
      )
      
      return addSecurityHeaders(errorResponse)
    }
  }

  // CSRF Protection for state-changing operations
  // Applied before any other processing to fail fast
  if (requiresCSRFProtection(request.method) && !isCSRFExempt(pathname)) {
    const isValidCSRF = await verifyCSRFToken(request)
    if (!isValidCSRF) {
      debugLog.middleware(`CSRF validation failed for ${pathname}`)
      return new NextResponse(
        JSON.stringify({ error: 'CSRF token validation failed' }), 
        {
          status: 403,
          headers: {
            ...response.headers,
            'Content-Type': 'application/json'
          }
        }
      )
    }
  }

  // Handle API routes
  if (pathname.startsWith('/api/')) {
    // Request sanitization for JSON bodies (skip for CSP reports - they contain policy strings that trigger false positives)
    if (['POST', 'PUT', 'PATCH'].includes(request.method) && pathname !== '/api/security/csp-report') {
      try {
        // Clone the request to read the body
        const clonedRequest = request.clone()
        const body = await clonedRequest.json().catch(() => null)
        
        if (body) {
          // Pass null for logger since it's not used (_logger parameter)
          const sanitizationResult = await sanitizeRequestBody(body, null as any)

          if (!sanitizationResult.isValid) {
            debugLog.middleware(`Request sanitization failed for ${pathname}: ${sanitizationResult.errors.join(', ')}`)
            return new NextResponse(
              JSON.stringify({
                error: 'Invalid request data',
                details: sanitizationResult.errors.slice(0, 3) // Only show first 3 errors
              }),
              {
                status: 400,
                headers: {
                  ...response.headers,
                  'Content-Type': 'application/json'
                }
              }
            )
          }
        }
      } catch (error) {
        // If body parsing fails, let the API route handle it
        debugLog.middleware(`Request body parsing failed for ${pathname}: ${error}`)
      }
    }
    
    // ✅ SECURITY: API routes now handle authentication via requireAuth() which supports both 
    // Authorization headers (for API clients) and httpOnly cookies (for browser requests)
    // No middleware modification needed - cleaner and more reliable
    
    return response
  }

  // Skip additional middleware for static files and internal Next.js routes
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/static/') ||
    pathname.includes('.')
  ) {
    return response
  }

  const isPublicPath = (path: string) => {
    return (
      path === '/signin' ||
      path === '/authenticating' ||
      path === '/reset-password' ||
      path === '/signup' ||
      path.startsWith('/reset-password/')
    )
  }

  const addNoStoreHeaders = (res: NextResponse) => {
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.headers.set('Pragma', 'no-cache')
    res.headers.set('Expires', '0')
    return res
  }

  /**
   * Validate user authentication for protected routes
   * Checks access token first, falls back to refresh token validation
   * SECURITY: Uses database validation for refresh tokens
   */
  async function validateAuthentication(request: NextRequest): Promise<boolean> {
    const accessToken = request.cookies.get('access-token')?.value
    const refreshToken = request.cookies.get('refresh-token')?.value

    debugLog.middleware(`Checking auth - access token: ${!!accessToken}, refresh token: ${!!refreshToken}`)

    if (accessToken) {
      // Validate access token (JWT signature check only)
      try {
        const jwtConfig = getJWTConfig()
        const { jwtVerify } = await import('jose')
        const ACCESS_TOKEN_SECRET = new TextEncoder().encode(jwtConfig.accessSecret)
        await jwtVerify(accessToken, ACCESS_TOKEN_SECRET)
        debugLog.middleware('Access token valid - allowing access')
        return true
      } catch (error) {
        debugLog.middleware('Access token invalid:', error instanceof Error ? error.message : String(error))
        // Access token invalid, try refresh token with database validation
        if (refreshToken) {
          debugLog.middleware('Validating refresh token with database...')
          const isValid = await validateRefreshTokenWithDB(refreshToken)
          if (isValid) {
            debugLog.middleware('Refresh token valid - allowing page to load for auto-refresh')
          }
          return isValid
        }
      }
    } else if (refreshToken) {
      // No access token, validate refresh token with database
      debugLog.middleware('No access token - validating refresh token with database...')
      const isValid = await validateRefreshTokenWithDB(refreshToken)
      if (isValid) {
        debugLog.middleware('Refresh token valid - allowing page to load for auto-refresh')
      }
      return isValid
    }

    debugLog.middleware('No valid authentication tokens found')
    return false
  }

  // Development: localhost or 127.0.0.1 goes to admin dashboard
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('192.168.')) {
    debugLog.middleware('Processing request for:', pathname)

    // Public paths (signin, reset-password, etc.) - allow through immediately
    if (isPublicPath(pathname)) {
      debugLog.middleware('Public path detected, allowing through:', pathname)
      return response
    }

    // Default-deny: protect all non-public routes
    debugLog.middleware('Protected route detected')

    const isAuthenticated = await validateAuthentication(request)

    if (!isAuthenticated) {
      debugLog.middleware('User not authenticated - redirecting to login')
      const signInUrl = new URL('/signin', request.url)
      signInUrl.searchParams.set('callbackUrl', `${pathname}${search}`)
      debugLog.middleware('Redirect URL:', signInUrl.toString())
      response = NextResponse.redirect(signInUrl)
      return addSecurityHeaders(response)
    } else {
      debugLog.middleware('User authenticated (or has refresh token) - allowing request to proceed')
    }

    response = addNoStoreHeaders(response)
    
    return response // Continue
  }

  // Check for admin/development subdomains (standardized authentication)
  const isAdminSubdomain = (host: string): boolean => {
    const adminSubdomains = [
      'app.bendcare.com', 
      'test.bendcare.com', 
      'dev.bendcare.com', 
      'development.bendcare.com', 
      'staging.bendcare.com',
      'localhost',
      'localhost:4001',
      '127.0.0.1',
      '127.0.0.1:4001'
    ]
    return adminSubdomains.includes(host)
  }

  if (isAdminSubdomain(hostname)) {
    if (!isPublicPath(pathname)) {
      const isAuthenticated = await validateAuthentication(request)

      if (!isAuthenticated) {
        const signInUrl = new URL('/signin', request.url)
        signInUrl.searchParams.set('callbackUrl', `${pathname}${search}`)
        response = NextResponse.redirect(signInUrl)
        return addSecurityHeaders(response)
      }

      response = addNoStoreHeaders(response)
    }

    return response // Continue
  }

  // Handle bendcare.com admin domains (app, staging, dev, development, test)
  if (hostname === 'app.bendcare.com' ||
      hostname === 'staging.bendcare.com' ||
      hostname === 'dev.bendcare.com' ||
      hostname === 'development.bendcare.com' ||
      hostname === 'test.bendcare.com') {

    if (!isPublicPath(pathname)) {
      const isAuthenticated = await validateAuthentication(request)

      if (!isAuthenticated) {
        const signInUrl = new URL('/signin', request.url)
        signInUrl.searchParams.set('callbackUrl', `${pathname}${search}`)
        response = NextResponse.redirect(signInUrl)
        return addSecurityHeaders(response)
      }

      response = addNoStoreHeaders(response)
    }

    return response // Continue
  }

  // All other domains: Rewrite to practice website
  // Extract the domain (remove www. if present)
  const domain = hostname.startsWith('www.') ? hostname.slice(4) : hostname
  
  // Debug logging for custom domain routing
  if (process.env.NODE_ENV === 'development' || process.env.ENVIRONMENT === 'staging') {
    console.log('🌐 Custom domain detected:', {
      originalHostname: rawHostname,
      processedHostname: hostname,
      extractedDomain: domain,
      pathname,
      rewriteTo: `/practice/${domain}${pathname}`
    })
  }
  
  // Rewrite to practice route
  const url = request.nextUrl.clone()
  url.pathname = `/practice/${domain}${pathname}`
  
  response = NextResponse.rewrite(url)
  return addSecurityHeaders(response)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * 
     * API routes are now included for CSRF protection
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}