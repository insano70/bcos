import { NextRequest, NextResponse } from 'next/server'
import { addSecurityHeaders, getEnhancedContentSecurityPolicy, addRateLimitHeaders, generateCSPNonces, type CSPNonces } from '@/lib/security/headers'
import { requiresCSRFProtection, verifyCSRFToken } from '@/lib/security/csrf-unified'
import { getJWTConfig } from '@/lib/env'
import { isPublicApiRoute } from '@/lib/api/middleware/global-auth'
import { debugLog } from '@/lib/utils/debug'
import { sanitizeRequestBody } from '@/lib/api/middleware/request-sanitization'
import { log } from '@/lib/logger'
import { applyRateLimit } from '@/lib/api/middleware/rate-limit'

// CSRF exempt paths - these endpoints handle their own security or don't need CSRF
const CSRF_EXEMPT_PATHS = [
  '/api/health',          // Health check endpoint (GET only, no state change)
  '/api/csrf',            // CSRF token generation endpoint (can't require CSRF to get CSRF)
  '/api/webhooks/',       // All webhook endpoints (external services)
  '/api/security/csp-report', // CSP violation reporting (automated browser requests)
  '/api/auth/saml/callback', // SAML callback (Microsoft Entra POST - security via SAML signature validation)
  // Note: login, register, and refresh are NOT exempt - they all require CSRF protection
  // - login/register use anonymous CSRF tokens
  // - refresh uses authenticated CSRF tokens
  // - saml/callback uses SAML signature validation instead of CSRF
]

function isCSRFExempt(pathname: string): boolean {
  return CSRF_EXEMPT_PATHS.some(path => 
    pathname === path || pathname.startsWith(path)
  )
}

export async function middleware(request: NextRequest) {
  // PRODUCTION FIX: Use X-Forwarded-Host from ALB, fallback to Host header for development
  const forwardedHost = request.headers.get('x-forwarded-host')
  const hostHeader = request.headers.get('host')
  const rawHostname = forwardedHost || hostHeader || request.nextUrl.hostname || 'localhost'
  const hostname = rawHostname.split(':')[0] || 'localhost' // Remove port for comparison
  const pathname = request.nextUrl.pathname
  const search = request.nextUrl.search
  
  // Generate CSP nonces for this request (from develop - better system)
  const { generateCSPNonces } = await import('@/lib/security/headers')
  const cspNonces = generateCSPNonces()
  
  // Create new request headers with nonces for SSR components to access
  const requestHeaders = new Headers(request.headers)
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
  
  // Debug CSP header setting
  if (process.env.NODE_ENV === 'development' || process.env.ENVIRONMENT === 'staging') {
    log.debug('Setting CSP header', {
      cspHeader,
      policyLength: cspPolicy.length
    });
  }
  
  response.headers.set(cspHeader, cspPolicy)
  
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
          // Create compatible logger for sanitization function
          const sanitizationLogger = {
            info: (message: string, meta?: unknown) => log.info(message, meta as Record<string, unknown>),
            warn: (message: string, meta?: unknown) => log.warn(message, meta as Record<string, unknown>),
            error: (message: string, meta?: unknown) => log.error(message, undefined, meta as Record<string, unknown>),
            debug: (message: string, meta?: unknown) => log.debug(message, meta as Record<string, unknown>)
          }
          
          const sanitizationResult = await sanitizeRequestBody(body, sanitizationLogger)
          
          if (!sanitizationResult.isValid) {
            // Enhanced request sanitization logging
            log.warn('Request validation failed', {
              errors: sanitizationResult.errors.map(error => ({
                field: 'request_body',
                message: error,
                code: 'INVALID_REQUEST_DATA'
              }))
            })

            log.security('request_sanitization_failed', 'medium', {
              reason: 'invalid_request_data',
              action: 'blocked_request',
              threat: 'data_injection'
            })
            
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

    // ✅ STANDARDIZED: Use access token for page authentication (consistent with API routes)
    const accessToken = request.cookies.get('access-token')?.value
    let isAuthenticated = false

    debugLog.middleware('Checking auth for path:', pathname)
    debugLog.middleware('Access token cookie exists:', !!accessToken)

    if (accessToken) {
      debugLog.middleware('Validating access token...')
      // Validate access token (same as API routes)
      try {
        const jwtConfig = getJWTConfig()
        const { jwtVerify } = await import('jose')
        const ACCESS_TOKEN_SECRET = new TextEncoder().encode(jwtConfig.accessSecret)
        await jwtVerify(accessToken, ACCESS_TOKEN_SECRET)
        isAuthenticated = true
        debugLog.middleware('Access token validation successful - allowing access')
      } catch (error) {
        debugLog.middleware('Access token validation failed:', error instanceof Error ? error.message : String(error))
      }
    } else {
      debugLog.middleware('No access token found in cookies')
    }

    if (!isAuthenticated) {
      debugLog.middleware('User not authenticated - redirecting to login')
      const signInUrl = new URL('/signin', request.url)
      signInUrl.searchParams.set('callbackUrl', `${pathname}${search}`)
      debugLog.middleware('Redirect URL:', signInUrl.toString())
      response = NextResponse.redirect(signInUrl)
      return addSecurityHeaders(response)
    } else {
      debugLog.middleware('User authenticated - allowing request to proceed')
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
      const accessToken = request.cookies.get('access-token')?.value
      let isAuthenticated = false
      
      if (accessToken) {
        // ✅ STANDARDIZED: Use access token validation (consistent with dev environment)
        try {
          const { jwtVerify } = await import('jose')
          const ACCESS_TOKEN_SECRET = new TextEncoder().encode(getJWTConfig().accessSecret)
          await jwtVerify(accessToken, ACCESS_TOKEN_SECRET)
          isAuthenticated = true
        } catch (error) {
          debugLog.middleware('Access token validation failed:', error)
        }
      }

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
      const accessToken = request.cookies.get('access-token')?.value
      let isAuthenticated = false
      
      if (accessToken) {
        // Use access token validation (consistent with admin subdomain)
        try {
          const { jwtVerify } = await import('jose')
          const ACCESS_TOKEN_SECRET = new TextEncoder().encode(getJWTConfig().accessSecret)
          await jwtVerify(accessToken, ACCESS_TOKEN_SECRET)
          isAuthenticated = true
        } catch (error) {
          debugLog.middleware('Access token validation failed:', error)
        }
      }

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