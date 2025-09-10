import { NextResponse } from 'next/server'

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
 * Content Security Policy configuration
 * Restricts resource loading to prevent XSS and other injection attacks
 */
export function getContentSecurityPolicy(): string {
  const isDevelopment = process.env.NODE_ENV === 'development'
  
  // Base CSP directives
  const csp = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      // Allow inline/eval only in development for hot reload
      ...(isDevelopment ? ["'unsafe-inline'", "'unsafe-eval'"] : []),
      // Trusted CDNs for charts and UI libraries
      'https://cdn.jsdelivr.net',
      'https://unpkg.com'
    ],
    'style-src': [
      "'self'",
      "'unsafe-inline'", // Required for CSS-in-JS and dynamic styles
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
    delete csp['upgrade-insecure-requests']
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
