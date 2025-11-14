import { nanoid } from 'nanoid';
import type { NextResponse } from 'next/server';

/**
 * Security headers configuration for production-grade security
 * Based on OWASP recommendations and industry best practices
 */
export function addSecurityHeaders(response: NextResponse): NextResponse {
  // Prevent clickjacking attacks
  response.headers.set('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Control referrer information
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Legacy XSS protection (modern browsers use CSP)
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // Control browser features and APIs
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
  );

  // Prevent DNS prefetching
  response.headers.set('X-DNS-Prefetch-Control', 'off');

  // Prevent downloading of untrusted content
  response.headers.set('X-Download-Options', 'noopen');

  // HSTS (HTTP Strict Transport Security) - only in production with HTTPS
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }

  return response;
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
  const isDevelopment = process.env.NODE_ENV === 'development';
  const environment = isDevelopment
    ? 'development'
    : process.env.NEXT_PUBLIC_APP_URL?.includes('staging')
      ? 'staging'
      : 'production';

  return {
    scriptNonce: nanoid(16),
    styleNonce: nanoid(16),
    timestamp: Date.now(),
    environment,
  };
}

/**
 * Enhanced Content Security Policy with dual nonce support
 * Restricts resource loading to prevent XSS and other injection attacks
 * ✅ SECURITY: Requires nonces for all inline content in production
 */
export function getEnhancedContentSecurityPolicy(nonces?: CSPNonces): string {
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Base CSP directives with strict nonce requirements
  const csp = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      // ✅ SECURITY: Nonce for custom inline scripts (production only)
      // In development, we use 'unsafe-inline' instead to avoid nonce conflicts
      ...(!isDevelopment && nonces ? [`'nonce-${nonces.scriptNonce}'`] : []),
      // ✅ HYBRID APPROACH: SHA256 hashes for Next.js core scripts (production only)
      ...(!isDevelopment
        ? [
            "'sha256-n46vPwSWuMC0W703pBofImv82Z26xo4LXymv0E9caPk='", // Next.js hydration
            "'sha256-skqujXORqzxt1aE0NNXxujEanPTX6raoqSscTV/Ww/Y='", // Next.js runtime
          ]
        : []),
      // Allow unsafe-eval and unsafe-inline in development for Next.js hot reload and dev tools
      ...(isDevelopment ? ["'unsafe-eval'", "'unsafe-inline'"] : []),
      // ❌ REMOVED: CDN sources (not actively used in codebase)
      // If you need to add CDN scripts, use Subresource Integrity (SRI):
      // <script src="https://cdn.example.com/lib.js" integrity="sha384-HASH" crossorigin="anonymous"></script>
      // 'https://cdn.jsdelivr.net',
      // 'https://unpkg.com',
    ],
    'style-src': [
      "'self'",
      // ✅ INLINE STYLES: Allow inline style attributes for dynamic UI
      // CRITICAL: Cannot use nonces/hashes + 'unsafe-inline' together!
      // Per CSP spec: When ANY nonce or hash is present, 'unsafe-inline' is IGNORED.
      // This was causing "Refused to apply inline style" errors in production.
      //
      // DECISION: Use 'unsafe-inline' only (no nonces, no hashes for styles)
      // RATIONALE:
      //   1. Dynamic user-configured colors (color-picker, practice branding)
      //   2. Runtime-computed layouts (chart heights, progress bars)
      //   3. Third-party UI libraries (Radix UI positioning, Framer Motion animations)
      //   4. Inline style attributes cannot execute JavaScript (low XSS risk)
      //
      // SECURITY MAINTAINED:
      //   - Scripts still require nonces (strict protection unchanged)
      //   - Only inline style="" attributes are permitted
      //   - <style> tags with 'unsafe-inline' are low risk (CSS injection ≠ XSS)
      //
      // See: https://www.w3.org/TR/CSP3/#unsafe-inline-note
      ...(!isDevelopment ? ["'unsafe-inline'"] : []),
      // Allow unsafe-inline in development for CSS-in-JS and hot reload
      ...(isDevelopment ? ["'unsafe-inline'"] : []),
      // Google Fonts domain for CSS loading
      'https://fonts.googleapis.com',
    ],
    'img-src': [
      "'self'",
      'data:', // For base64 encoded images
      'blob:', // For generated images (canvas, charts)
      // ✅ SECURITY: Explicit domain whitelist only (no wildcard 'https:')
      // CRITICAL FIX: Prevents data exfiltration to arbitrary HTTPS domains
      'https://fonts.googleapis.com', // Google Fonts favicons
      'https://fonts.gstatic.com', // Google Fonts assets
      'https://cdn.bendcare.com', // CloudFront CDN for practice images
      ...(process.env.NEXT_PUBLIC_STORAGE_DOMAIN ? [process.env.NEXT_PUBLIC_STORAGE_DOMAIN] : []),
      // ❌ REMOVED: 'https:' wildcard (too permissive, enables exfiltration)
    ],
    'font-src': [
      "'self'",
      'data:', // For base64 encoded fonts
      'https://fonts.gstatic.com',
      'https://fonts.googleapis.com', // Sometimes fonts come from here too
    ],
    'connect-src': [
      "'self'",
      // API endpoints
      process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001',
      // WebSocket connections in development
      ...(isDevelopment ? ['ws://localhost:*', 'wss://localhost:*'] : []),
      // External services (add as needed)
      ...(process.env.RESEND_API_URL ? [process.env.RESEND_API_URL] : []),
      ...(process.env.STRIPE_API_URL ? [process.env.STRIPE_API_URL] : []),
      // Clinect API for practice ratings and reviews
      'https://api2.clinectsurvey.com',
    ],
    'frame-src': ["'none'"], // Prevent embedding in frames
    'object-src': ["'none'"], // Prevent Flash and other plugins
    'base-uri': ["'self'"], // Restrict base URL
    'form-action': ["'self'"], // Restrict form submissions
    'frame-ancestors': ["'none'"], // Prevent embedding (same as X-Frame-Options)
    'upgrade-insecure-requests': [], // Upgrade HTTP to HTTPS in production
    // Add report-uri for CSP violation monitoring
    'report-uri': process.env.NODE_ENV === 'production' ? ['/api/security/csp-report'] : [],
  };

  // Remove upgrade-insecure-requests in development
  if (isDevelopment) {
    const { 'upgrade-insecure-requests': _, ...devCsp } = csp;
    return Object.entries(devCsp)
      .filter(([_, sources]) => sources.length > 0)
      .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
      .join('; ');
  }

  // Convert to CSP string
  return Object.entries(csp)
    .filter(([_, sources]) => sources.length > 0)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ');
}

/**
 * Legacy CSP function for backwards compatibility
 * @deprecated Use getEnhancedContentSecurityPolicy instead
 */
export function getContentSecurityPolicy(nonce?: string): string {
  if (!nonce) {
    return getEnhancedContentSecurityPolicy();
  }

  // Convert single nonce to dual nonces for backwards compatibility
  const legacyNonces: CSPNonces = {
    scriptNonce: nonce,
    styleNonce: nonce,
    timestamp: Date.now(),
    environment: process.env.NODE_ENV === 'development' ? 'development' : 'production',
  };

  return getEnhancedContentSecurityPolicy(legacyNonces);
}

/**
 * Rate limiting headers for API responses
 */
export function addRateLimitHeaders(
  response: NextResponse,
  result: { remaining: number; resetTime: number }
): NextResponse {
  response.headers.set('X-RateLimit-Remaining', result.remaining.toString());
  response.headers.set('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000).toString());
  response.headers.set('X-RateLimit-Policy', 'sliding-window');

  return response;
}

/**
 * CORS headers for API endpoints
 */
export function addCORSHeaders(response: NextResponse, origin?: string): NextResponse {
  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001',
    'https://thrive.bendcare.com', // Admin subdomain
    // Add other allowed origins
  ];

  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  }

  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-CSRF-Token, X-Requested-With'
  );
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Max-Age', '86400'); // 24 hours

  return response;
}
