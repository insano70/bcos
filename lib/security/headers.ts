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
 * Generate dual nonces for script and style CSP
 * Returns separate nonces for enhanced security isolation
 */
export interface CSPNonces {
  scriptNonce: string;
  styleNonce: string;
  timestamp: number;
  environment: 'development' | 'staging' | 'production';
}

export function generateCSPNonces(): CSPNonces {
  const isDevelopment = process.env.NODE_ENV === 'development'
  const environment = isDevelopment 
    ? 'development' 
    : (process.env.NEXT_PUBLIC_APP_URL?.includes('staging') ? 'staging' : 'production')

  return {
    scriptNonce: nanoid(16),
    styleNonce: nanoid(16), 
    timestamp: Date.now(),
    environment
  };
}

/**
 * Enhanced Content Security Policy with dual nonce support
 * Restricts resource loading to prevent XSS and other injection attacks
 * ✅ SECURITY: Requires nonces for all inline content in production
 */
export function getEnhancedContentSecurityPolicy(nonces?: CSPNonces): string {
  const isDevelopment = process.env.NODE_ENV === 'development'
  
  // Base CSP directives with strict nonce requirements
  const csp = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      // ✅ SECURITY: Strict nonce-only policy for inline scripts
      ...(nonces ? [`'nonce-${nonces.scriptNonce}'`] : []),
      // Allow unsafe-eval only in development for Next.js hot reload
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
      // Remove unsafe-inline in production - nonce required
      ...(isDevelopment && !nonces ? ["'unsafe-inline'"] : []),
      // Trusted CDNs for charts and UI libraries
      'https://cdn.jsdelivr.net',
      'https://unpkg.com',
      // Next.js chunks and webpack runtime
      ...(isDevelopment ? ["'unsafe-eval'"] : [])
    ],
    'style-src': [
      "'self'",
      // ✅ SECURITY: Separate nonce for styles
      ...(nonces ? [`'nonce-${nonces.styleNonce}'`] : []),
      // Allow unsafe-inline only in development for CSS-in-JS and hot reload
      ...(isDevelopment && !nonces ? ["'unsafe-inline'"] : []),
      // Google Fonts
      'https://fonts.googleapis.com'
    ],
    'img-src': [
      "'self'",
      'data:', // For base64 encoded images
      'blob:', // For generated images (canvas, charts)
      'https:', // Allow all HTTPS images
      // Add your CDN/storage domains here
      ...(process.env.NEXT_PUBLIC_STORAGE_DOMAIN ? [process.env.NEXT_PUBLIC_STORAGE_DOMAIN] : [])
    ],
    'font-src': [
      "'self'",
      'data:', // For base64 encoded fonts
      'https://fonts.gstatic.com',
      'https://fonts.googleapis.com' // Sometimes fonts come from here too
    ],
    'connect-src': [
      "'self'",
      // API endpoints
      process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001',
      // WebSocket connections in development
      ...(isDevelopment ? ['ws://localhost:*', 'wss://localhost:*'] : []),
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
    // Add report-uri for CSP violation monitoring
    'report-uri': process.env.NODE_ENV === 'production' ? ['/api/security/csp-report'] : []
  }
  
  // Remove upgrade-insecure-requests in development
  if (isDevelopment) {
    const { 'upgrade-insecure-requests': _, ...devCsp } = csp
    return Object.entries(devCsp)
      .filter(([_, sources]) => sources.length > 0)
      .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
      .join('; ')
  }
  
  // Convert to CSP string
  return Object.entries(csp)
    .filter(([_, sources]) => sources.length > 0)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ')
}

/**
 * Legacy CSP function for backwards compatibility
 * @deprecated Use getEnhancedContentSecurityPolicy instead
 */
export function getContentSecurityPolicy(nonce?: string): string {
  if (!nonce) {
    return getEnhancedContentSecurityPolicy()
  }
  
  // Convert single nonce to dual nonces for backwards compatibility
  const legacyNonces: CSPNonces = {
    scriptNonce: nonce,
    styleNonce: nonce,
    timestamp: Date.now(),
    environment: process.env.NODE_ENV === 'development' ? 'development' : 'production'
  }
  
  return getEnhancedContentSecurityPolicy(legacyNonces)
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
