import { nanoid } from 'nanoid'
import { cookies } from 'next/headers'
import type { NextRequest } from 'next/server'

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
   * Set CSRF token in HTTP-only cookie
   */
  static async setCSRFToken(): Promise<string> {
    const token = CSRFProtection.generateToken()
    const cookieStore = cookies()
    
    cookieStore.set(CSRFProtection.cookieName, token, {
      httpOnly: true,
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
    const cookieStore = cookies()
    return cookieStore.get(CSRFProtection.cookieName)?.value || null
  }
  
  /**
   * Verify CSRF token from request headers against cookie
   */
  static async verifyCSRFToken(request: NextRequest): Promise<boolean> {
    try {
      const headerToken = request.headers.get(CSRFProtection.headerName)
      const cookieToken = request.cookies.get(CSRFProtection.cookieName)?.value
      
      // Both tokens must exist and match
      if (!headerToken || !cookieToken) {
        return false
      }
      
      // Constant-time comparison to prevent timing attacks
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
    const token = this.generateToken()
    const cookieStore = cookies()
    
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
