/**
 * Edge Runtime Compatible CSRF Protection
 * Uses Web Crypto API instead of Node.js crypto module
 */

import { nanoid } from 'nanoid'
import type { NextRequest } from 'next/server'

export class EdgeCSRFProtection {
  private static readonly cookieName = 'csrf-token'
  private static readonly headerName = 'x-csrf-token'

  /**
   * Normalize IP address for consistent token validation
   */
  private static normalizeIP(rawIP: string): string {
    if (rawIP === '::1' || rawIP === '127.0.0.1' || rawIP === 'localhost') {
      return 'localhost'
    }
    return rawIP
  }

  /**
   * Extract and normalize IP from request
   */
  private static getRequestIP(request: NextRequest): string {
    const rawIP = request.headers.get('x-forwarded-for') || 
                  request.headers.get('x-real-ip') || 
                  'unknown'
    return EdgeCSRFProtection.normalizeIP(rawIP)
  }

  /**
   * Get time window with development flexibility
   */
  private static getTimeWindow(): number {
    const isDevelopment = globalThis.process?.env?.NODE_ENV === 'development'
    const windowSize = isDevelopment ? 900000 : 300000
    return Math.floor(Date.now() / windowSize)
  }

  /**
   * Generate anonymous CSRF token using Web Crypto API
   */
  static async generateAnonymousToken(request: NextRequest): Promise<string> {
    const secret = globalThis.process?.env?.CSRF_SECRET
    if (!secret) {
      throw new Error('CSRF_SECRET environment variable is required')
    }
    
    const payload = {
      type: 'anonymous',
      ip: EdgeCSRFProtection.getRequestIP(request),
      userAgent: request.headers.get('user-agent') || 'unknown',
      timeWindow: EdgeCSRFProtection.getTimeWindow(),
      nonce: nanoid(8)
    }
    
    const tokenData = JSON.stringify(payload)
    const encoder = new TextEncoder()
    
    // Use Web Crypto API for HMAC
    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    
    const signatureArrayBuffer = await globalThis.crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(tokenData)
    )
    
    const signature = Array.from(new Uint8Array(signatureArrayBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    
    const signedToken = `${btoa(tokenData)}.${signature}`
    return signedToken
  }

  /**
   * Validate anonymous CSRF token using Web Crypto API
   */
  static async validateAnonymousToken(request: NextRequest, token: string): Promise<boolean> {
    try {
      const isDevelopment = globalThis.process?.env?.NODE_ENV === 'development'
      const secret = globalThis.process?.env?.CSRF_SECRET
      if (!secret) {
        throw new Error('CSRF_SECRET environment variable is required')
      }
      
      const [encodedPayload, signature] = token.split('.')
      
      if (!encodedPayload || !signature) {
        return false
      }

      // Verify signature using Web Crypto API
      const encoder = new TextEncoder()
      const key = await globalThis.crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      )
      
      const signatureBytes = new Uint8Array(
        signature.match(/.{2}/g)!.map(byte => parseInt(byte, 16))
      )
      
      const isSignatureValid = await globalThis.crypto.subtle.verify(
        'HMAC',
        key,
        signatureBytes,
        encoder.encode(atob(encodedPayload))
      )
      
      if (!isSignatureValid) {
        return false
      }
      
      // Parse and validate payload
      const payload = JSON.parse(atob(encodedPayload))
      
      if (payload.type !== 'anonymous') {
        return false
      }
      
      // Validate request fingerprint
      const currentIp = EdgeCSRFProtection.getRequestIP(request)
      const currentUserAgent = request.headers.get('user-agent') || 'unknown'
      const currentTimeWindow = EdgeCSRFProtection.getTimeWindow()
      
      const timeWindowMatch = isDevelopment 
        ? Math.abs(payload.timeWindow - currentTimeWindow) <= 1
        : payload.timeWindow === currentTimeWindow
      
      const isValid = (
        payload.ip === currentIp &&
        payload.userAgent === currentUserAgent &&
        timeWindowMatch
      )
      
      if (!isValid && isDevelopment) {
        console.log('🔍 Edge CSRF Validation Failed:', {
          payload: {
            ip: payload.ip,
            timeWindow: payload.timeWindow
          },
          current: {
            ip: currentIp,
            timeWindow: currentTimeWindow
          },
          matches: {
            ip: payload.ip === currentIp,
            userAgent: payload.userAgent === currentUserAgent,
            timeWindow: timeWindowMatch
          }
        })
      }
      
      return isValid
    } catch (error) {
      if (globalThis.process?.env?.NODE_ENV === 'development') {
        console.log('🔍 Edge CSRF Validation Error:', error)
      }
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
   * Endpoints that allow anonymous CSRF tokens
   */
  private static readonly ANONYMOUS_TOKEN_ALLOWED_ENDPOINTS = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/forgot-password',
    '/api/auth/reset-password'
  ]

  /**
   * Check if an endpoint allows anonymous CSRF tokens
   */
  private static isAnonymousEndpoint(pathname: string): boolean {
    return EdgeCSRFProtection.ANONYMOUS_TOKEN_ALLOWED_ENDPOINTS.some(
      endpoint => pathname === endpoint || pathname.startsWith(endpoint + '/')
    )
  }

  /**
   * Verify CSRF token (Edge Runtime compatible)
   */
  static async verifyCSRFToken(request: NextRequest): Promise<boolean> {
    try {
      const headerToken = request.headers.get(EdgeCSRFProtection.headerName)
      const pathname = request.nextUrl.pathname
      const isAnonymousEndpoint = EdgeCSRFProtection.isAnonymousEndpoint(pathname)
      
      if (!headerToken) {
        return false
      }
      
      if (isAnonymousEndpoint) {
        // For login/register, validate as anonymous token
        return await EdgeCSRFProtection.validateAnonymousToken(request, headerToken)
      } else {
        // For other endpoints, use simple double-submit cookie pattern
        const cookieToken = request.cookies.get(EdgeCSRFProtection.cookieName)?.value
        if (!cookieToken) {
          return false
        }
        
        // Simple string comparison (constant time)
        return headerToken === cookieToken
      }
    } catch (error) {
      return false
    }
  }
}
