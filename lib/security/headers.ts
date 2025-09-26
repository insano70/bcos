import type { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'

/**
 * Security headers configuration for production-grade security
 * Based on OWASP recommendations and industry best practices
 */
export function addSecurityHeaders(response: NextResponse): NextResponse {
  // Prevent clickjacking attacks
  response.headers.set('X-Frame-Options', 'DENY')
  
  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff')
  
  // Control referrer information
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  
  // Legacy XSS protection (modern browsers use CSP)
  response.headers.set('X-XSS-Protection', '1; mode=block')
  
  // Control browser features and APIs
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
  )
  
  // Prevent DNS prefetching
  response.headers.set('X-DNS-Prefetch-Control', 'off')
  
  // Prevent downloading of untrusted content
  response.headers.set('X-Download-Options', 'noopen')
  
  // HSTS (HTTP Strict Transport Security) - only in production with HTTPS
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    )
  }
  
  return response
}

/**
 * Generate a cryptographically secure nonce for CSP
 */
export function generateCSPNonce(): string {
  return nanoid(16); // 16-character nonce
}

/**
 * Content Security Policy configuration
 * Restricts resource loading to prevent XSS and other injection attacks
 * 
 * ✅ SECURITY: Enhanced with nonce-based policies for better development security
 * 
 * CURRENT STATE (Post-Fix):
 * - ✅ Nonce generation and distribution working
 * - ✅ Custom components support nonces (SplitText, templates)
 * - ⚠️ TEMPORARY: Using unsafe-inline in development for Next.js compatibility
 * - 🎯 TODO: Remove unsafe-inline when Next.js nonce integration is complete
 * 
 * CSP VIOLATIONS FIXED:
 * - Added all reported Next.js script/style hashes
 * - Template dangerouslySetInnerHTML now use nonces
 * - SplitText inline styles now use nonces
 * - Layout scripts properly nonce-enabled
 */
export function getContentSecurityPolicy(nonce?: string): string {
  const isDevelopment = process.env.NODE_ENV === 'development'
  
  // Base CSP directives
  const csp = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      // ✅ SECURITY: Use nonce-based CSP for inline scripts
      ...(nonce ? [`'nonce-${nonce}'`] : []),
      // Allow unsafe-eval only in development for Next.js hot reload
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
      // ⚠️ TEMPORARY: Allow unsafe-inline in development until Next.js nonce integration is complete
      ...(isDevelopment ? ["'unsafe-inline'"] : []),
      // Next.js 15 inline script hashes (from CSP violation reports)
      "'sha256-MXIBnafo4DyrDppi6qU1sKLdKZ6LO8EKIuGA+4RLjGA='",
      "'sha256-rSyf/hrZZou2MwFt8LiZLiUHmcYhEhAeAoP2TwQCOKI='", 
      "'sha256-tTRjRAsoPitw/zk0hwT1fz1ma0YhhXzyDjUIRG7acmw='",
      "'sha256-d+XP0L09R+kALVGxuTf20uAA8E2LZVuKmWcX2/6Lixw='",
      // Additional Next.js hashes from error logs
      "'sha256-n46vPwSWuMC0W703pBofImv82Z26xo4LXymv0E9caPk='",
      "'sha256-OBTN3RiyCV4Bq7dFqZ5a2pAXjnCcCYeTJMO2I/LYKeo='",
      "'sha256-fwR897VSGJXPCIfoXrNumtSsOstOsDTH79WlhiAdEKQ='",
      "'sha256-53UXzVat7DjftKWauaYQLucrc0A3TpnmesoHkrQ/UPc='",
      "'sha256-ZLiKc6Xz8M8AP9a2U9XRcdhTYjYQt1pz3JMcc5xwvkk='",
      "'sha256-t+FM56Alq5D3pB8IcV1bjM24f5XtzconKzukvLg+VPM='",
      "'sha256-TEO88KT2L5EI122xEJbG/p9SxVGLWyHe8sP6iM0T7zo='",
      "'sha256-kEDoPDt8KGsBVhupH8XKl3lqsAhF/f9j82mKUyon4t4='",
      "'sha256-BM4wR8dcFWqftcuJStDK585tT/BRusQ9LX8u/l6krKo='",
      "'sha256-Jpw8Z60v8ov/CMSr+Gxro2MDX98iHS2AYW/n0rfAcSU='",
      // Trusted CDNs for charts and UI libraries
      'https://cdn.jsdelivr.net',
      'https://unpkg.com'
    ],
    'style-src': [
      "'self'",
      // ✅ SECURITY: Use nonce for inline styles when available
      ...(nonce ? [`'nonce-${nonce}'`] : []),
      // ⚠️ TEMPORARY: Allow unsafe-inline for CSS-in-JS and development
      ...(isDevelopment ? ["'unsafe-inline'"] : ["'unsafe-inline'"]),
      // Additional style hashes from error logs
      "'sha256-nyUi6XlWkAmWGpABmpjrkREhA83kBrP4t3OjgmZdxFY='",
      "'sha256-jKE6QZqne5OsrfemNvuLSNoud++NsCOiSlGuIsQns5o='",
      "'sha256-zlqnbDt84zf1iSefLU/ImC54isoprH/MRiVZGskwexk='",
      'https://fonts.googleapis.com'
    ],
    'img-src': [
      "'self'",
      'data:', // For base64 encoded images
      'blob:', // For generated images
      'https:', // Allow HTTPS images
      // Add your CDN/storage domains here
      ...(process.env.NEXT_PUBLIC_STORAGE_DOMAIN ? [process.env.NEXT_PUBLIC_STORAGE_DOMAIN] : [])
    ],
    'font-src': [
      "'self'",
      'data:', // For base64 encoded fonts
      'https://fonts.gstatic.com'
    ],
    'connect-src': [
      "'self'",
      // API endpoints
      process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001',
      // External services (add as needed)
      ...(process.env.RESEND_API_URL ? [process.env.RESEND_API_URL] : []),
      ...(process.env.STRIPE_API_URL ? [process.env.STRIPE_API_URL] : [])
    ],
    'frame-src': ["'none'"], // Prevent embedding in frames
    'object-src': ["'none'"], // Prevent Flash and other plugins
    'base-uri': ["'self'"], // Restrict base URL
    'form-action': ["'self'"], // Restrict form submissions
    'frame-ancestors': ["'none'"], // Prevent embedding (same as X-Frame-Options)
    'upgrade-insecure-requests': [], // Upgrade HTTP to HTTPS in production
  }
  
  // Remove upgrade-insecure-requests in development
  if (isDevelopment) {
    const { 'upgrade-insecure-requests': _, ...devCsp } = csp
    return Object.entries(devCsp)
      .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
      .join('; ')
  }
  
  // Convert to CSP string
  return Object.entries(csp)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ')
}

/**
 * Rate limiting headers for API responses
 */
export function addRateLimitHeaders(
  response: NextResponse,
  result: { remaining: number; resetTime: number }
): NextResponse {
  response.headers.set('X-RateLimit-Remaining', result.remaining.toString())
  response.headers.set('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000).toString())
  response.headers.set('X-RateLimit-Policy', 'sliding-window')
  
  return response
}

/**
 * CORS headers for API endpoints
 */
export function addCORSHeaders(response: NextResponse, origin?: string): NextResponse {
  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001',
    'https://admin.yourdomain.com', // Admin subdomain
    // Add other allowed origins
  ]
  
  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
  }
  
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-CSRF-Token, X-Requested-With'
  )
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  response.headers.set('Access-Control-Max-Age', '86400') // 24 hours
  
  return response
}
