import { NextRequest, NextResponse } from 'next/server'
import { addSecurityHeaders, getContentSecurityPolicy } from '@/lib/security/headers'
import { CSRFProtection } from '@/lib/security/csrf'
import { getJWTConfig } from '@/lib/env'
import { isPublicApiRoute } from '@/lib/api/middleware/global-auth'
import { debugLog } from '@/lib/utils/debug'

export async function middleware(request: NextRequest) {
  const hostname = request.nextUrl.hostname
  const pathname = request.nextUrl.pathname
  const search = request.nextUrl.search
  let response = NextResponse.next()

  // Apply security headers to all responses
  response = addSecurityHeaders(response)
  
  // Add Content Security Policy
  response.headers.set('Content-Security-Policy', getContentSecurityPolicy())

  // Handle API routes with global authentication
  if (pathname.startsWith('/api/')) {
    // CSRF protection for state-changing operations
    // Applied to ALL routes except webhooks (which come from external services)
    if (CSRFProtection.requiresCSRFProtection(request.method) &&
        !pathname.startsWith('/api/webhooks/')) {
      const isValidCSRF = await CSRFProtection.verifyCSRFToken(request)
      if (!isValidCSRF) {
        return new NextResponse('CSRF Token Invalid', {
          status: 403,
          headers: response.headers
        })
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

    // Default-deny: protect all non-public routes
    if (!isPublicPath(pathname)) {
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
    }
    
    return response // Continue
  }

  // Production: Check for admin subdomain (standardized authentication)
  if (hostname.startsWith('admin.')) {
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

  // All other domains: Rewrite to practice website
  // Extract the domain (remove www. if present)
  const domain = hostname.startsWith('www.') ? hostname.slice(4) : hostname
  
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
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}