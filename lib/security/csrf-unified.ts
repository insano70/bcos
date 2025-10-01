/**
 * Unified CSRF Protection
 * Edge Runtime compatible with full feature parity
 * Combines EdgeCSRFProtection and CSRFProtection functionality
 */

import { nanoid } from 'nanoid';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { createAppLogger } from '@/lib/logger/factory';
import { CSRFSecurityMonitor } from './csrf-monitoring';

// Enhanced security logger for CSRF protection
const csrfSecurityLogger = createAppLogger('csrf-unified', {
  component: 'security',
  feature: 'csrf-protection',
  module: 'csrf-unified',
  securityLevel: 'critical',
});

/**
 * Unified CSRF Protection class that works in both Edge Runtime and Node.js
 * Implements secure token generation, validation, and management
 */
export class UnifiedCSRFProtection {
  private static readonly cookieName = 'csrf-token';
  private static readonly headerName = 'x-csrf-token';
  private static readonly tokenLength = 32;

  /**
   * Get CSRF secret from environment with proper fallback
   * Works in both Edge Runtime and Node.js environments
   */
  private static getCSRFSecret(): string {
    const secret = process.env.CSRF_SECRET || globalThis.process?.env?.CSRF_SECRET;
    if (!secret) {
      throw new Error('CSRF_SECRET environment variable is required');
    }
    if (secret.length < 32) {
      throw new Error('CSRF_SECRET must be at least 32 characters for security');
    }
    return secret;
  }

  /**
   * Normalize IP address for consistent token validation
   * Handles localhost variations and proxy forwarding
   */
  private static normalizeIP(rawIP: string): string {
    // Handle localhost variations
    if (rawIP === '::1' || rawIP === '127.0.0.1' || rawIP === 'localhost') {
      return 'localhost';
    }

    // Handle IPv6 mapped IPv4 addresses
    if (rawIP.startsWith('::ffff:')) {
      const ipv4 = rawIP.substring(7);
      if (ipv4 === '127.0.0.1') {
        return 'localhost';
      }
      return ipv4;
    }

    return rawIP;
  }

  /**
   * Extract and normalize IP from request with comprehensive proxy support
   * Prioritizes most reliable headers first
   */
  private static getRequestIP(request: NextRequest): string {
    // Priority order for IP extraction
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
      // Take first IP from comma-separated list (original client)
      const firstIP = forwardedFor.split(',')[0];
      return UnifiedCSRFProtection.normalizeIP(firstIP?.trim() || 'unknown');
    }

    const realIP = request.headers.get('x-real-ip');
    if (realIP) {
      return UnifiedCSRFProtection.normalizeIP(realIP);
    }

    // Cloudflare connecting IP
    const cfConnectingIP = request.headers.get('cf-connecting-ip');
    if (cfConnectingIP) {
      return UnifiedCSRFProtection.normalizeIP(cfConnectingIP);
    }

    // Other common proxy headers
    const trueClientIP = request.headers.get('true-client-ip');
    if (trueClientIP) {
      return UnifiedCSRFProtection.normalizeIP(trueClientIP);
    }

    const clientIP = request.headers.get('x-client-ip');
    if (clientIP) {
      return UnifiedCSRFProtection.normalizeIP(clientIP);
    }

    // Fallback to request.ip or unknown
    const requestIP = (request as { ip?: string }).ip;
    return UnifiedCSRFProtection.normalizeIP(requestIP || 'unknown');
  }

  /**
   * Get time window with development flexibility
   * Development: 15-minute windows, Production: 5-minute windows
   */
  private static getTimeWindow(): number {
    const isDevelopment =
      (process.env.NODE_ENV || globalThis.process?.env?.NODE_ENV) === 'development';
    const windowSize = isDevelopment ? 900000 : 300000; // 15min dev, 5min prod
    return Math.floor(Date.now() / windowSize);
  }

  /**
   * Generate anonymous CSRF token using Web Crypto API (Edge compatible)
   * Used for protecting public endpoints like login/register
   */
  static async generateAnonymousToken(request: NextRequest): Promise<string> {
    const secret = UnifiedCSRFProtection.getCSRFSecret();

    const payload = {
      type: 'anonymous',
      ip: UnifiedCSRFProtection.getRequestIP(request),
      userAgent: request.headers.get('user-agent') || 'unknown',
      timeWindow: UnifiedCSRFProtection.getTimeWindow(),
      nonce: nanoid(8), // Prevent replay attacks
      timestamp: Date.now(), // Additional entropy
    };

    const tokenData = JSON.stringify(payload);
    const encoder = new TextEncoder();

    // Use Web Crypto API for HMAC (Edge Runtime compatible)
    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureArrayBuffer = await globalThis.crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(tokenData)
    );

    const signature = Array.from(new Uint8Array(signatureArrayBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const signedToken = `${btoa(tokenData)}.${signature}`;
    return signedToken;
  }

  /**
   * Generate authenticated CSRF token for logged-in users
   * More secure with user-specific binding
   */
  static async generateAuthenticatedToken(userId?: string): Promise<string> {
    const secret = UnifiedCSRFProtection.getCSRFSecret();

    const payload = {
      type: 'authenticated',
      timestamp: Date.now(),
      nonce: nanoid(16), // Longer nonce for authenticated tokens
      userId: userId || 'session',
      timeWindow: UnifiedCSRFProtection.getTimeWindow(),
    };

    const tokenData = JSON.stringify(payload);
    const encoder = new TextEncoder();

    // Use Web Crypto API for consistency
    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureArrayBuffer = await globalThis.crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(tokenData)
    );

    const signature = Array.from(new Uint8Array(signatureArrayBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const signedToken = `${btoa(tokenData)}.${signature}`;
    return signedToken;
  }

  /**
   * Validate anonymous CSRF token using Web Crypto API
   * Verifies request fingerprint and time window
   */
  static async validateAnonymousToken(request: NextRequest, token: string): Promise<boolean> {
    try {
      const isDevelopment =
        (process.env.NODE_ENV || globalThis.process?.env?.NODE_ENV) === 'development';
      const secret = UnifiedCSRFProtection.getCSRFSecret();

      const [encodedPayload, signature] = token.split('.');

      if (!encodedPayload || !signature) {
        if (isDevelopment) {
          csrfSecurityLogger.debug('CSRF token parse failed', {
            tokenLength: token.length,
            hasDot: token.includes('.'),
            parts: token.split('.').length,
            component: 'token-validation',
          });
        }
        return false;
      }

      // Verify signature using Web Crypto API
      const encoder = new TextEncoder();
      const key = await globalThis.crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );

      const signatureBytes = new Uint8Array(
        signature.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))
      );

      const isSignatureValid = await globalThis.crypto.subtle.verify(
        'HMAC',
        key,
        signatureBytes,
        encoder.encode(atob(encodedPayload))
      );

      if (!isSignatureValid) {
        if (isDevelopment) {
          csrfSecurityLogger.debug('🔍 CSRF Signature Invalid');
        }
        return false;
      }

      // Parse and validate payload
      const payload = JSON.parse(atob(encodedPayload));

      if (payload.type !== 'anonymous') {
        if (isDevelopment) {
          csrfSecurityLogger.debug('🔍 CSRF Token Type Mismatch:', {
            expected: 'anonymous',
            actual: payload.type,
          });
        }
        return false;
      }

      // Validate request fingerprint
      const currentIp = UnifiedCSRFProtection.getRequestIP(request);
      const currentUserAgent = request.headers.get('user-agent') || 'unknown';
      const currentTimeWindow = UnifiedCSRFProtection.getTimeWindow();

      // Allow time window flexibility in development
      const timeWindowMatch = isDevelopment
        ? Math.abs(payload.timeWindow - currentTimeWindow) <= 1
        : payload.timeWindow === currentTimeWindow;

      const isValid =
        payload.ip === currentIp && payload.userAgent === currentUserAgent && timeWindowMatch;

      if (!isValid && isDevelopment) {
        csrfSecurityLogger.debug('🔍 CSRF Anonymous Validation Failed:', {
          payload: {
            ip: payload.ip,
            userAgent: payload.userAgent?.substring(0, 30) + '...',
            timeWindow: payload.timeWindow,
          },
          current: {
            ip: currentIp,
            userAgent: currentUserAgent?.substring(0, 30) + '...',
            timeWindow: currentTimeWindow,
          },
          matches: {
            ip: payload.ip === currentIp,
            userAgent: payload.userAgent === currentUserAgent,
            timeWindow: timeWindowMatch,
          },
        });
      }

      return isValid;
    } catch (error) {
      const isDevelopment =
        (process.env.NODE_ENV || globalThis.process?.env?.NODE_ENV) === 'development';
      if (isDevelopment) {
        csrfSecurityLogger.debug('🔍 CSRF Anonymous Validation Error:', { error });
      }
      return false;
    }
  }

  /**
   * Validate authenticated CSRF token
   * Verifies signature and token structure
   */
  static async validateAuthenticatedToken(token: string): Promise<boolean> {
    try {
      const secret = UnifiedCSRFProtection.getCSRFSecret();
      const [encodedPayload, signature] = token.split('.');

      if (!encodedPayload || !signature) {
        return false;
      }

      // Verify signature using Web Crypto API
      const encoder = new TextEncoder();
      const key = await globalThis.crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );

      const signatureBytes = new Uint8Array(
        signature.match(/.{2}/g)!.map((byte) => parseInt(byte, 16))
      );

      const isSignatureValid = await globalThis.crypto.subtle.verify(
        'HMAC',
        key,
        signatureBytes,
        encoder.encode(atob(encodedPayload))
      );

      if (!isSignatureValid) {
        return false;
      }

      // Parse and validate payload
      const payload = JSON.parse(atob(encodedPayload));

      if (payload.type !== 'authenticated') {
        return false;
      }

      // Check token age (24 hours max for authenticated tokens)
      const tokenAge = Date.now() - payload.timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      return tokenAge <= maxAge;
    } catch (error) {
      return false;
    }
  }

  /**
   * Set CSRF token in cookie (server-side only)
   * Works in both Edge Runtime and Node.js environments
   */
  static async setCSRFToken(userId?: string): Promise<string> {
    const token = await UnifiedCSRFProtection.generateAuthenticatedToken(userId);

    try {
      const cookieStore = await cookies();

      cookieStore.set(UnifiedCSRFProtection.cookieName, token, {
        httpOnly: false, // Must be readable by JavaScript for header inclusion
        secure: (process.env.NODE_ENV || globalThis.process?.env?.NODE_ENV) === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24, // 24 hours
        path: '/',
      });
    } catch (error) {
      // In Edge Runtime, cookies() might not be available in all contexts
      // This is handled gracefully - token is still returned for manual setting
      const isDevelopment =
        (process.env.NODE_ENV || globalThis.process?.env?.NODE_ENV) === 'development';
      if (isDevelopment) {
        csrfSecurityLogger.debug('Cookie setting failed (Edge Runtime context):', { error });
      }
    }

    return token;
  }

  /**
   * Get CSRF token from cookies (server-side only)
   */
  static async getCSRFToken(): Promise<string | null> {
    try {
      const cookieStore = await cookies();
      return cookieStore.get(UnifiedCSRFProtection.cookieName)?.value || null;
    } catch (error) {
      // Edge Runtime context might not have cookies() available
      return null;
    }
  }

  /**
   * Endpoints that allow anonymous CSRF tokens
   * All other endpoints require authenticated tokens
   */
  private static readonly ANONYMOUS_TOKEN_ALLOWED_ENDPOINTS = [
    '/api/auth/register',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/contact', // Public contact forms
  ];

  /**
   * Endpoints that allow both anonymous AND authenticated CSRF tokens
   * These endpoints need to handle both logged-in and non-logged-in users
   */
  private static readonly DUAL_TOKEN_ALLOWED_ENDPOINTS = [
    '/api/auth/login', // Users might login while already authenticated (re-auth, account switching)
  ];

  /**
   * Check if an endpoint allows anonymous CSRF tokens
   */
  static isAnonymousEndpoint(pathname: string): boolean {
    return UnifiedCSRFProtection.ANONYMOUS_TOKEN_ALLOWED_ENDPOINTS.some(
      (endpoint) => pathname === endpoint || pathname.startsWith(endpoint + '/')
    );
  }

  /**
   * Check if an endpoint allows both anonymous and authenticated CSRF tokens
   */
  static isDualTokenEndpoint(pathname: string): boolean {
    return UnifiedCSRFProtection.DUAL_TOKEN_ALLOWED_ENDPOINTS.some(
      (endpoint) => pathname === endpoint || pathname.startsWith(endpoint + '/')
    );
  }

  /**
   * Verify CSRF token from request (unified validation logic)
   * Handles both anonymous and authenticated tokens appropriately
   */
  static async verifyCSRFToken(request: NextRequest): Promise<boolean> {
    try {
      const headerToken = request.headers.get(UnifiedCSRFProtection.headerName);
      const cookieToken = request.cookies.get(UnifiedCSRFProtection.cookieName)?.value;
      const pathname = request.nextUrl.pathname;
      const isAnonymousEndpoint = UnifiedCSRFProtection.isAnonymousEndpoint(pathname);
      const isDualTokenEndpoint = UnifiedCSRFProtection.isDualTokenEndpoint(pathname);

      if (!headerToken) {
        // Enhanced security logging for missing header tokens
        csrfSecurityLogger.security('csrf_header_token_missing', 'medium', {
          action: 'csrf_validation_failed',
          reason: 'missing_header_token',
          pathname,
          ip: UnifiedCSRFProtection.getRequestIP(request),
          userAgent: request.headers.get('user-agent')?.substring(0, 100),
          timestamp: new Date().toISOString(),
          threat: 'csrf_attack_attempt',
          blocked: true,
        });

        // Record failure for security monitoring
        CSRFSecurityMonitor.recordFailure(request, 'missing_header_token', 'medium');
        return false;
      }

      if (isAnonymousEndpoint) {
        // For anonymous-only endpoints (register, forgot-password), validate against request fingerprint
        const isValid = await UnifiedCSRFProtection.validateAnonymousToken(request, headerToken);
        if (!isValid) {
          csrfSecurityLogger.security('csrf_anonymous_token_invalid', 'medium', {
            action: 'anonymous_token_validation_failed',
            reason: 'invalid_anonymous_token',
            pathname,
            ip: UnifiedCSRFProtection.getRequestIP(request),
            userAgent: request.headers.get('user-agent')?.substring(0, 100),
            timestamp: new Date().toISOString(),
            threat: 'csrf_token_forgery',
            blocked: true,
            endpointType: 'anonymous',
          });

          // Record failure for security monitoring
          CSRFSecurityMonitor.recordFailure(request, 'anonymous_token_validation_failed', 'medium');
        }
        return isValid;
      } else if (isDualTokenEndpoint) {
        // For dual token endpoints (login), accept both anonymous and authenticated tokens
        // First, determine token type by parsing the header token
        try {
          const [encodedPayload] = headerToken.split('.');
          if (encodedPayload) {
            const payload = JSON.parse(atob(encodedPayload));

            if (payload.type === 'anonymous') {
              // Validate as anonymous token (no cookie required)
              const isValid = await UnifiedCSRFProtection.validateAnonymousToken(
                request,
                headerToken
              );
              if (!isValid) {
                csrfSecurityLogger.security('csrf_dual_anonymous_token_invalid', 'medium', {
                  action: 'dual_endpoint_anonymous_validation_failed',
                  reason: 'invalid_anonymous_token_on_dual_endpoint',
                  pathname,
                  ip: UnifiedCSRFProtection.getRequestIP(request),
                  userAgent: request.headers.get('user-agent')?.substring(0, 100),
                  timestamp: new Date().toISOString(),
                  threat: 'csrf_token_forgery',
                  blocked: true,
                  endpointType: 'dual_anonymous_mode',
                });
                CSRFSecurityMonitor.recordFailure(
                  request,
                  'anonymous_token_validation_failed_dual_endpoint',
                  'medium'
                );
              }
              return isValid;
            } else if (payload.type === 'authenticated') {
              // Validate as authenticated token (require cookie and signature validation)
              if (!cookieToken) {
                csrfSecurityLogger.security('csrf_dual_cookie_token_missing', 'medium', {
                  action: 'dual_endpoint_cookie_validation_failed',
                  reason: 'missing_cookie_token_for_authenticated_token',
                  pathname,
                  ip: UnifiedCSRFProtection.getRequestIP(request),
                  userAgent: request.headers.get('user-agent')?.substring(0, 100),
                  timestamp: new Date().toISOString(),
                  threat: 'csrf_attack_attempt',
                  blocked: true,
                  endpointType: 'dual_authenticated_mode',
                  hasHeader: true,
                  hasCookie: false,
                });
                CSRFSecurityMonitor.recordFailure(
                  request,
                  'missing_cookie_token_dual_endpoint',
                  'medium'
                );
                return false;
              }

              // Validate authenticated token signature
              const isTokenValid =
                await UnifiedCSRFProtection.validateAuthenticatedToken(headerToken);
              if (!isTokenValid) {
                csrfSecurityLogger.security('csrf_dual_authenticated_token_invalid', 'high', {
                  action: 'dual_endpoint_signature_validation_failed',
                  reason: 'invalid_authenticated_token_signature',
                  pathname,
                  ip: UnifiedCSRFProtection.getRequestIP(request),
                  userAgent: request.headers.get('user-agent')?.substring(0, 100),
                  timestamp: new Date().toISOString(),
                  threat: 'csrf_token_tampering',
                  blocked: true,
                  endpointType: 'dual_authenticated_mode',
                  validationStage: 'signature_verification',
                });
                CSRFSecurityMonitor.recordFailure(
                  request,
                  'authenticated_token_signature_invalid_dual_endpoint',
                  'medium'
                );
                return false;
              }

              // Verify double-submit cookie pattern
              const isDoubleSubmitValid = UnifiedCSRFProtection.constantTimeCompare(
                headerToken,
                cookieToken
              );
              if (!isDoubleSubmitValid) {
                csrfSecurityLogger.security('csrf_dual_double_submit_failed', 'high', {
                  action: 'dual_endpoint_double_submit_validation_failed',
                  reason: 'header_cookie_token_mismatch',
                  pathname,
                  ip: UnifiedCSRFProtection.getRequestIP(request),
                  userAgent: request.headers.get('user-agent')?.substring(0, 100),
                  timestamp: new Date().toISOString(),
                  threat: 'csrf_token_tampering',
                  blocked: true,
                  endpointType: 'dual_authenticated_mode',
                  validationStage: 'double_submit_cookie_verification',
                });
                CSRFSecurityMonitor.recordFailure(
                  request,
                  'double_submit_validation_failed_dual_endpoint',
                  'medium'
                );
              }
              return isDoubleSubmitValid;
            }
          }
        } catch (parseError) {
          // Enhanced token parsing failure logging
          csrfSecurityLogger.security('csrf_token_parsing_failed', 'medium', {
            action: 'dual_endpoint_token_parsing_failed',
            reason: 'malformed_token_structure',
            pathname,
            ip: UnifiedCSRFProtection.getRequestIP(request),
            userAgent: request.headers.get('user-agent')?.substring(0, 100),
            timestamp: new Date().toISOString(),
            threat: 'csrf_token_tampering',
            blocked: true,
            endpointType: 'dual_mode',
            parseError: parseError instanceof Error ? parseError.message : String(parseError),
          });
          CSRFSecurityMonitor.recordFailure(
            request,
            'token_parsing_failed_dual_endpoint',
            'medium'
          );
          return false;
        }

        // If we get here, token type wasn't recognized
        csrfSecurityLogger.security('csrf_unrecognized_token_type', 'medium', {
          action: 'dual_endpoint_unrecognized_token_type',
          reason: 'unknown_token_type',
          pathname,
          ip: UnifiedCSRFProtection.getRequestIP(request),
          userAgent: request.headers.get('user-agent')?.substring(0, 100),
          timestamp: new Date().toISOString(),
          threat: 'csrf_token_forgery',
          blocked: true,
          endpointType: 'dual_mode',
        });
        CSRFSecurityMonitor.recordFailure(
          request,
          'unrecognized_token_type_dual_endpoint',
          'medium'
        );
        return false;
      } else {
        // For authenticated endpoints, require both header and cookie tokens
        if (!cookieToken) {
          csrfSecurityLogger.security('csrf_cookie_token_missing', 'medium', {
            action: 'authenticated_endpoint_cookie_validation_failed',
            reason: 'missing_cookie_token_for_authenticated_endpoint',
            pathname,
            ip: UnifiedCSRFProtection.getRequestIP(request),
            userAgent: request.headers.get('user-agent')?.substring(0, 100),
            timestamp: new Date().toISOString(),
            threat: 'csrf_attack_attempt',
            blocked: true,
            endpointType: 'authenticated',
            hasHeader: true,
            hasCookie: false,
          });

          // Record failure for security monitoring
          CSRFSecurityMonitor.recordFailure(
            request,
            'missing_cookie_token_authenticated_endpoint',
            'medium'
          );
          return false;
        }

        // Parse header token to determine type
        try {
          const [encodedPayload] = headerToken.split('.');
          if (encodedPayload) {
            const payload = JSON.parse(atob(encodedPayload));

            // Security check: prevent anonymous tokens on protected endpoints
            if (payload.type === 'anonymous') {
              csrfSecurityLogger.security(
                'csrf_security_violation_anonymous_on_protected',
                'high',
                {
                  action: 'security_violation_detected',
                  reason: 'anonymous_token_used_on_protected_endpoint',
                  pathname,
                  ip: UnifiedCSRFProtection.getRequestIP(request),
                  userAgent: request.headers.get('user-agent')?.substring(0, 100),
                  timestamp: new Date().toISOString(),
                  threat: 'privilege_escalation_attempt',
                  blocked: true,
                  endpointType: 'protected',
                  violationType: 'anonymous_token_on_authenticated_endpoint',
                  securityImpact: 'high',
                }
              );

              // Record high-severity failure for security monitoring
              CSRFSecurityMonitor.recordFailure(
                request,
                'anonymous_token_on_protected_endpoint',
                'high'
              );
              return false;
            }

            // For authenticated tokens, validate signature and double-submit pattern
            if (payload.type === 'authenticated') {
              const isTokenValid =
                await UnifiedCSRFProtection.validateAuthenticatedToken(headerToken);
              if (!isTokenValid) {
                csrfSecurityLogger.security('csrf_authenticated_token_invalid', 'high', {
                  action: 'authenticated_endpoint_signature_validation_failed',
                  reason: 'invalid_authenticated_token_signature',
                  pathname,
                  ip: UnifiedCSRFProtection.getRequestIP(request),
                  userAgent: request.headers.get('user-agent')?.substring(0, 100),
                  timestamp: new Date().toISOString(),
                  threat: 'csrf_token_tampering',
                  blocked: true,
                  endpointType: 'authenticated',
                  validationStage: 'signature_verification',
                });

                // Record failure for security monitoring
                CSRFSecurityMonitor.recordFailure(
                  request,
                  'authenticated_token_signature_invalid',
                  'medium'
                );
                return false;
              }

              // Verify double-submit cookie pattern (constant-time comparison)
              const isDoubleSubmitValid = UnifiedCSRFProtection.constantTimeCompare(
                headerToken,
                cookieToken
              );
              if (!isDoubleSubmitValid) {
                csrfSecurityLogger.security('csrf_double_submit_failed', 'high', {
                  action: 'authenticated_endpoint_double_submit_validation_failed',
                  reason: 'header_cookie_token_mismatch',
                  pathname,
                  ip: UnifiedCSRFProtection.getRequestIP(request),
                  userAgent: request.headers.get('user-agent')?.substring(0, 100),
                  timestamp: new Date().toISOString(),
                  threat: 'csrf_token_tampering',
                  blocked: true,
                  endpointType: 'authenticated',
                  validationStage: 'double_submit_cookie_verification',
                });

                // Record failure for security monitoring
                CSRFSecurityMonitor.recordFailure(
                  request,
                  'double_submit_validation_failed',
                  'medium'
                );
              }
              return isDoubleSubmitValid;
            }
          }
        } catch (parseError) {
          // If token parsing fails, fall back to simple double-submit check
          // This handles legacy tokens during migration
          const isDevelopment =
            (process.env.NODE_ENV || globalThis.process?.env?.NODE_ENV) === 'development';
          if (isDevelopment) {
            csrfSecurityLogger.debug('CSRF token parsing failed, using legacy validation');
          }
        }

        // Fallback: simple double-submit pattern for legacy tokens
        const isValid = UnifiedCSRFProtection.constantTimeCompare(headerToken, cookieToken);
        if (!isValid) {
          csrfSecurityLogger.security('csrf_legacy_token_validation_failed', 'low', {
            action: 'legacy_token_validation_failed',
            reason: 'legacy_double_submit_pattern_failed',
            pathname,
            ip: UnifiedCSRFProtection.getRequestIP(request),
            userAgent: request.headers.get('user-agent')?.substring(0, 100),
            timestamp: new Date().toISOString(),
            threat: 'csrf_attack_attempt',
            blocked: true,
            endpointType: 'authenticated_legacy',
            validationMethod: 'simple_double_submit',
          });

          // Record failure for security monitoring
          CSRFSecurityMonitor.recordFailure(request, 'legacy_token_validation_failed', 'low');
        }
        return isValid;
      }
    } catch (error) {
      csrfSecurityLogger.security('csrf_verification_system_error', 'high', {
        action: 'csrf_verification_system_failure',
        reason: 'unexpected_error_during_verification',
        pathname: request.nextUrl.pathname,
        ip: UnifiedCSRFProtection.getRequestIP(request),
        userAgent: request.headers.get('user-agent')?.substring(0, 100),
        timestamp: new Date().toISOString(),
        threat: 'system_instability',
        blocked: true,
        errorType: error instanceof Error ? error.name : 'unknown',
        errorMessage: error instanceof Error ? error.message : String(error),
        systemError: true,
      });

      // Record failure for security monitoring
      const errorMessage = error instanceof Error ? error.message : 'unknown_error';
      CSRFSecurityMonitor.recordFailure(request, `verification_error_${errorMessage}`, 'medium');
      return false;
    }
  }

  /**
   * Check if request method requires CSRF protection
   */
  static requiresCSRFProtection(method: string): boolean {
    return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   */
  private static constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }

  /**
   * Generate simple CSRF token for backward compatibility
   */
  static generateToken(): string {
    return nanoid(UnifiedCSRFProtection.tokenLength);
  }
}
