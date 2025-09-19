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
    
    // Create a fingerprint from request properties
    const fingerprint = [
      request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      request.headers.get('user-agent') || 'unknown',
      Math.floor(Date.now() / 300000), // 5-minute window
      secret
    ].join('|')
    
    return crypto.createHash('sha256').update(fingerprint).digest('hex')
  }

  /**
   * Validate anonymous CSRF token
   */
  static validateAnonymousToken(request: NextRequest, token: string): boolean {
    const expectedToken = CSRFProtection.generateAnonymousToken(request)
    try {
      return crypto.timingSafeEqual(
        Buffer.from(token, 'hex'),
        Buffer.from(expectedToken, 'hex')
      )
    } catch {
      return false
    }
  }
  
  /**
   * Set CSRF token in cookie (non-httpOnly for frontend access)
   */
  static async setCSRFToken(): Promise<string> {
    const token = CSRFProtection.generateToken()
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
   * Verify CSRF token from request headers against cookie
   */
  static async verifyCSRFToken(request: NextRequest): Promise<boolean> {
    try {
      const headerToken = request.headers.get(CSRFProtection.headerName)
      const cookieToken = request.cookies.get(CSRFProtection.cookieName)?.value
      
      // Both tokens must exist
      if (!headerToken || !cookieToken) {
        return false
      }
      
      // For login and other anonymous endpoints, validate as anonymous token
      const pathname = request.nextUrl.pathname
      if (pathname === '/api/auth/login' || pathname === '/api/auth/register') {
        return CSRFProtection.validateAnonymousToken(request, headerToken)
      }
      
      // For authenticated endpoints, use double-submit cookie pattern
      return CSRFProtection.constantTimeCompare(headerToken, cookieToken)
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
