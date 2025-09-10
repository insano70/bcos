import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { addSecurityHeaders, getContentSecurityPolicy } from '@/lib/security/headers'
import { CSRFProtection } from '@/lib/security/csrf'

export async function middleware(request: NextRequest) {
  const hostname = request.nextUrl.hostname
  const pathname = request.nextUrl.pathname
  let response = NextResponse.next()

  // Apply security headers to all responses
  response = addSecurityHeaders(response)
  
  // Add Content Security Policy
  response.headers.set('Content-Security-Policy', getContentSecurityPolicy())

  // Skip additional middleware for API routes, static files, and internal Next.js routes
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/static/') ||
    pathname.includes('.')
  ) {
    // CSRF protection for API routes with state-changing methods
    if (pathname.startsWith('/api/') && CSRFProtection.requiresCSRFProtection(request.method)) {
      const isValidCSRF = await CSRFProtection.verifyCSRFToken(request)
      if (!isValidCSRF) {
        return new NextResponse('CSRF Token Invalid', { 
          status: 403,
          headers: response.headers
        })
      }
    }
    
    return response
  }

  // Development: localhost or 127.0.0.1 goes to admin dashboard
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('192.168.')) {
    // Check authentication for protected routes
    if (pathname.startsWith('/dashboard') || pathname.startsWith('/configure')) {
      // Check NextAuth session for now (we'll integrate tokens later)
      const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
      
      if (!token) {
        const signInUrl = new URL('/signin', request.url)
        signInUrl.searchParams.set('callbackUrl', pathname)
        response = NextResponse.redirect(signInUrl)
        return addSecurityHeaders(response)
      }
    }
    
    return response // Continue to admin dashboard
  }

  // Production: Check for admin subdomain
  if (hostname.startsWith('admin.')) {
    // Check NextAuth session for now (we'll integrate tokens later)
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
    
    if (!token) {
      const signInUrl = new URL('/signin', request.url)
      signInUrl.searchParams.set('callbackUrl', pathname)
      response = NextResponse.redirect(signInUrl)
      return addSecurityHeaders(response)
    }
    
    return response // Continue to admin dashboard
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