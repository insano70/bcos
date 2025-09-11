import { NextRequest, NextResponse } from 'next/server'
import { addSecurityHeaders, getContentSecurityPolicy } from '@/lib/security/headers'
import { CSRFProtection } from '@/lib/security/csrf'
import { getJWTConfig } from '@/lib/env'
import { isPublicApiRoute } from '@/lib/api/middleware/global-auth'

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
    // CSRF protection for API routes with state-changing methods
    if (CSRFProtection.requiresCSRFProtection(request.method)) {
      const isValidCSRF = await CSRFProtection.verifyCSRFToken(request)
      if (!isValidCSRF) {
        return new NextResponse('CSRF Token Invalid', { 
          status: 403,
          headers: response.headers
        })
      }
    }

    // Global API authentication (except for public routes)
    if (!isPublicApiRoute(pathname)) {
      const refreshToken = request.cookies.get('refresh-token')?.value
      let isAuthenticated = false
      
      if (refreshToken) {
        try {
          const { jwtVerify } = await import('jose')
          const REFRESH_TOKEN_SECRET = new TextEncoder().encode(getJWTConfig().refreshSecret)
          await jwtVerify(refreshToken, REFRESH_TOKEN_SECRET)
          isAuthenticated = true
        } catch (error) {
          console.log('API auth failed:', error)
        }
      }
      
      if (!isAuthenticated) {
        return new NextResponse(JSON.stringify({
          success: false,
          error: 'Authentication required',
          code: 'AUTHENTICATION_REQUIRED'
        }), { 
          status: 401,
          headers: { 'Content-Type': 'application/json', ...response.headers }
        })
      }
    }
    
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
    // Default-deny: protect all non-public routes
    if (!isPublicPath(pathname)) {
      // Check for refresh token cookie first
      const refreshToken = request.cookies.get('refresh-token')?.value
      let isAuthenticated = false
      
      if (refreshToken) {
        // Validate refresh token
        try {
          const { jwtVerify } = await import('jose')
          const REFRESH_TOKEN_SECRET = new TextEncoder().encode(getJWTConfig().refreshSecret)
          await jwtVerify(refreshToken, REFRESH_TOKEN_SECRET)
          isAuthenticated = true
        } catch (error) {
          console.log('Refresh token validation failed:', error)
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

  // Production: Check for admin subdomain
  if (hostname.startsWith('admin.')) {
    if (!isPublicPath(pathname)) {
      const refreshToken = request.cookies.get('refresh-token')?.value
      let isAuthenticated = false
      
      if (refreshToken) {
        // Validate refresh token
        try {
          const { jwtVerify } = await import('jose')
          const REFRESH_TOKEN_SECRET = new TextEncoder().encode(getJWTConfig().refreshSecret)
          await jwtVerify(refreshToken, REFRESH_TOKEN_SECRET)
          isAuthenticated = true
        } catch (error) {
          console.log('Refresh token validation failed:', error)
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