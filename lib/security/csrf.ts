import { nanoid } from 'nanoid'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'
import crypto from 'crypto'

/**
 * CSRF (Cross-Site Request Forgery) Protection
 * Implements double-submit cookie pattern for stateless CSRF protection
 */
export class CSRFProtection {
  private static readonly tokenLength = 32
  private static readonly cookieName = 'csrf-token'
  private static readonly headerName = 'x-csrf-token'
  
  /**
   * Generate a cryptographically secure CSRF token
   */
  static generateToken(): string {
    return nanoid(CSRFProtection.tokenLength)
  }

  /**
   * Generate anonymous CSRF token based on request fingerprint
   * Used for protecting public endpoints like login
   */
  static generateAnonymousToken(request: NextRequest): string {
    const secret = process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production'
    
    // Create a payload with type information
    const payload = {
      type: 'anonymous',
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      userAgent: request.headers.get('user-agent') || 'unknown',
      timeWindow: Math.floor(Date.now() / 300000), // 5-minute window
      nonce: nanoid(8) // Add randomness to prevent replay attacks
    }
    
    // Create a signed token
    const tokenData = JSON.stringify(payload)
    const signature = crypto
      .createHmac('sha256', secret)
      .update(tokenData)
      .digest('hex')
    
    // Return base64 encoded token with signature
    const signedToken = `${Buffer.from(tokenData).toString('base64')}.${signature}`
    return signedToken
  }

  /**
   * Validate anonymous CSRF token
   */
  static validateAnonymousToken(request: NextRequest, token: string): boolean {
    try {
      const secret = process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production'
      const [encodedPayload, signature] = token.split('.')
      
      if (!encodedPayload || !signature) {
        return false
      }
      
      // Verify signature
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(Buffer.from(encodedPayload, 'base64').toString())
        .digest('hex')
      
      if (!crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      )) {
        return false
      }
      
      // Parse and validate payload
      const payload = JSON.parse(Buffer.from(encodedPayload, 'base64').toString())
      
      // Check token type
      if (payload.type !== 'anonymous') {
        return false
      }
      
      // Validate request fingerprint
      const currentIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
      const currentUserAgent = request.headers.get('user-agent') || 'unknown'
      const currentTimeWindow = Math.floor(Date.now() / 300000)
      
      return (
        payload.ip === currentIp &&
        payload.userAgent === currentUserAgent &&
        payload.timeWindow === currentTimeWindow
      )
    } catch {
      return false
    }
  }
  
  /**
   * Generate authenticated CSRF token with type information
   */
  static generateAuthenticatedToken(userId?: string): string {
    const secret = process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production'
    
    // Create a payload with type information
    const payload = {
      type: 'authenticated',
      timestamp: Date.now(),
      nonce: nanoid(16), // Longer nonce for authenticated tokens
      userId: userId || 'session' // Include user ID if available
    }
    
    // Create a signed token
    const tokenData = JSON.stringify(payload)
    const signature = crypto
      .createHmac('sha256', secret)
      .update(tokenData)
      .digest('hex')
    
    // Return base64 encoded token with signature
    const signedToken = `${Buffer.from(tokenData).toString('base64')}.${signature}`
    return signedToken
  }

  /**
   * Set CSRF token in cookie (non-httpOnly for frontend access)
   */
  static async setCSRFToken(userId?: string): Promise<string> {
    const token = CSRFProtection.generateAuthenticatedToken(userId)
    const cookieStore = await cookies()
    
    cookieStore.set(CSRFProtection.cookieName, token, {
      httpOnly: false, // Must be readable by JavaScript
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    })
    
    return token
  }
  
  /**
   * Get CSRF token from cookies
   */
  static async getCSRFToken(): Promise<string | null> {
    const cookieStore = await cookies()
    return cookieStore.get(CSRFProtection.cookieName)?.value || null
  }
  
  /**
   * Endpoints that allow anonymous CSRF tokens
   * All other endpoints require authenticated tokens
   */
  private static readonly ANONYMOUS_TOKEN_ALLOWED_ENDPOINTS = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/contact' // If you have a public contact form
  ]

  /**
   * Check if an endpoint allows anonymous CSRF tokens
   */
  private static isAnonymousEndpoint(pathname: string): boolean {
    return CSRFProtection.ANONYMOUS_TOKEN_ALLOWED_ENDPOINTS.some(
      endpoint => pathname === endpoint || pathname.startsWith(endpoint + '/')
    )
  }

  /**
   * Verify CSRF token from request headers against cookie
   * Enforces strict token scope validation
   */
  static async verifyCSRFToken(request: NextRequest): Promise<boolean> {
    try {
      const headerToken = request.headers.get(CSRFProtection.headerName)
      const cookieToken = request.cookies.get(CSRFProtection.cookieName)?.value
      
      // Both tokens must exist
      if (!headerToken || !cookieToken) {
        console.error('CSRF validation failed: Missing token', {
          hasHeader: !!headerToken,
          hasCookie: !!cookieToken,
          pathname: request.nextUrl.pathname
        })
        return false
      }
      
      const pathname = request.nextUrl.pathname
      const isAnonymousEndpoint = CSRFProtection.isAnonymousEndpoint(pathname)
      
      // For anonymous endpoints, validate as anonymous token
      if (isAnonymousEndpoint) {
        // Anonymous tokens are validated against request fingerprint
        const isValid = CSRFProtection.validateAnonymousToken(request, headerToken)
        if (!isValid) {
          console.error('Anonymous CSRF token validation failed', {
            pathname,
            ip: request.headers.get('x-forwarded-for') || 'unknown'
          })
        }
        return isValid
      }
      
      // For authenticated endpoints, we need to ensure:
      // 1. The token is NOT an anonymous token (security boundary)
      // 2. The token matches the cookie (double-submit pattern)
      
      // Parse token to check its type
      try {
        const [encodedPayload] = headerToken.split('.')
        if (encodedPayload) {
          const payload = JSON.parse(Buffer.from(encodedPayload, 'base64').toString())
          
          // Check if someone is trying to use an anonymous token on a protected endpoint
          if (payload.type === 'anonymous') {
            console.error('SECURITY: Anonymous CSRF token used on protected endpoint', {
              pathname,
              ip: request.headers.get('x-forwarded-for') || 'unknown',
              error: 'ANONYMOUS_TOKEN_ON_PROTECTED_ENDPOINT'
            })
            return false // Reject - anonymous tokens not allowed here
          }
          
          // For authenticated tokens, verify signature and double-submit
          if (payload.type === 'authenticated') {
            // Verify token signature
            const secret = process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production'
            const [, signature] = headerToken.split('.')
            const expectedSignature = crypto
              .createHmac('sha256', secret)
              .update(Buffer.from(encodedPayload, 'base64').toString())
              .digest('hex')
            
            if (!crypto.timingSafeEqual(
              Buffer.from(signature || '', 'hex'),
              Buffer.from(expectedSignature, 'hex')
            )) {
              console.error('Authenticated CSRF token signature invalid', { pathname })
              return false
            }
            
            // Verify double-submit cookie pattern
            const isValid = CSRFProtection.constantTimeCompare(headerToken, cookieToken)
            if (!isValid) {
              console.error('Authenticated CSRF token mismatch', {
                pathname,
                tokenMismatch: true
              })
            }
            return isValid
          }
        }
      } catch (e) {
        // If we can't parse the token, fall back to simple comparison
        // This handles legacy tokens during transition
      }
      
      // Fallback for legacy tokens (simple double-submit pattern)
      const isValid = CSRFProtection.constantTimeCompare(headerToken, cookieToken)
      if (!isValid) {
        console.error('CSRF token validation failed (legacy check)', {
          pathname,
          tokenMismatch: true
        })
      }
      return isValid
      
    } catch (error) {
      console.error('CSRF verification error:', error)
      return false
    }
  }
  
  /**
   * Check if request method requires CSRF protection
   */
  static requiresCSRFProtection(method: string): boolean {
    return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())
  }
  
  /**
   * Constant-time string comparison to prevent timing attacks
   */
  private static constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false
    }
    
    let result = 0
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i)
    }
    
    return result === 0
  }
  
  /**
   * Generate CSRF token for client-side use (non-HTTP-only)
   */
  static async setClientCSRFToken(): Promise<string> {
    const token = CSRFProtection.generateToken()
    const cookieStore = await cookies()
    
    // Set a separate token for client-side access
    cookieStore.set('csrf-token-client', token, {
      httpOnly: false, // Accessible to JavaScript
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    })
    
    return token
  }
}
