/**
 * Unified CSRF Protection - Pure Functions Module
 * Edge Runtime compatible with full feature parity
 * Combines EdgeCSRFProtection and CSRFProtection functionality
 * SECURITY: CSRF_SECRET remains module-scoped (not exported)
 */

import { nanoid } from 'nanoid';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

/**
 * CSRF Protection Constants
 */
export const CSRF_COOKIE_NAME = 'csrf-token';
export const CSRF_HEADER_NAME = 'x-csrf-token';
export const CSRF_TOKEN_LENGTH = 32;

/**
 * Get CSRF secret from environment with proper fallback
 * Works in both Edge Runtime and Node.js environments
 * Non-exported helper - keeps secret access internal
 */
function getCSRFSecret(): string {
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
 * Non-exported helper function
 */
function normalizeIP(rawIP: string): string {
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
  function getRequestIP(request: NextRequest): string {
    // Priority order for IP extraction
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
      // Take first IP from comma-separated list (original client)
      const firstIP = forwardedFor.split(',')[0];
      return normalizeIP(firstIP?.trim() || 'unknown');
    }

    const realIP = request.headers.get('x-real-ip');
    if (realIP) {
      return normalizeIP(realIP);
    }

    // Cloudflare connecting IP
    const cfConnectingIP = request.headers.get('cf-connecting-ip');
    if (cfConnectingIP) {
      return normalizeIP(cfConnectingIP);
    }

    // Other common proxy headers
    const trueClientIP = request.headers.get('true-client-ip');
    if (trueClientIP) {
      return normalizeIP(trueClientIP);
    }

    const clientIP = request.headers.get('x-client-ip');
    if (clientIP) {
      return normalizeIP(clientIP);
    }

    // Fallback to request.ip or unknown
    const requestIP = (request as { ip?: string }).ip;
    return normalizeIP(requestIP || 'unknown');
  }

  /**
   * Get time window with development flexibility
   * Development: 15-minute windows, Production: 5-minute windows
   */
  function getTimeWindow(): number {
    const isDevelopment =
      (process.env.NODE_ENV || globalThis.process?.env?.NODE_ENV) === 'development';
    const windowSize = isDevelopment ? 900000 : 300000; // 15min dev, 5min prod
    return Math.floor(Date.now() / windowSize);
  }

  /**
   * Generate anonymous CSRF token using Web Crypto API (Edge compatible)
   * Used for protecting public endpoints like login/register
   */
  export async function generateAnonymousToken(request: NextRequest): Promise<string> {
    const secret = getCSRFSecret();

    const payload = {
      type: 'anonymous',
      ip: getRequestIP(request),
      userAgent: request.headers.get('user-agent') || 'unknown',
      timeWindow: getTimeWindow(),
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
  export async function generateAuthenticatedToken(userId?: string): Promise<string> {
    const secret = getCSRFSecret();

    const payload = {
      type: 'authenticated',
      timestamp: Date.now(),
      nonce: nanoid(16), // Longer nonce for authenticated tokens
      userId: userId || 'session',
      timeWindow: getTimeWindow(),
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
  export async function validateAnonymousToken(request: NextRequest, token: string): Promise<boolean> {
    try {
      const isDevelopment =
        (process.env.NODE_ENV || globalThis.process?.env?.NODE_ENV) === 'development';
      const secret = getCSRFSecret();

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

      const signatureMatch = signature.match(/.{2}/g);
      if (!signatureMatch) {
        throw new Error('Invalid signature format');
      }
      const signatureBytes = new Uint8Array(signatureMatch.map((byte) => parseInt(byte, 16)));

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

      if (payload.type !== 'anonymous') {
        return false;
      }

      // Validate request fingerprint
      const currentIp = getRequestIP(request);
      const currentUserAgent = request.headers.get('user-agent') || 'unknown';
      const currentTimeWindow = getTimeWindow();

      // Allow time window flexibility in development
      const timeWindowMatch = isDevelopment
        ? Math.abs(payload.timeWindow - currentTimeWindow) <= 1
        : payload.timeWindow === currentTimeWindow;

      const isValid =
        payload.ip === currentIp && payload.userAgent === currentUserAgent && timeWindowMatch;

      return isValid;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Validate authenticated CSRF token
   * Verifies signature and token structure
   */
  export async function validateAuthenticatedToken(token: string): Promise<boolean> {
    try {
      const secret = getCSRFSecret();
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

      const signatureMatch = signature.match(/.{2}/g);
      if (!signatureMatch) {
        throw new Error('Invalid signature format');
      }
      const signatureBytes = new Uint8Array(signatureMatch.map((byte) => parseInt(byte, 16)));

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
    } catch (_error) {
      return false;
    }
  }

  /**
   * Set CSRF token in cookie (server-side only)
   * Works in both Edge Runtime and Node.js environments
   */
  export async function setCSRFToken(userId?: string): Promise<string> {
    const token = await generateAuthenticatedToken(userId);

    try {
      const cookieStore = await cookies();

      cookieStore.set(CSRF_COOKIE_NAME, token, {
        httpOnly: false, // Must be readable by JavaScript for header inclusion
        secure: (process.env.NODE_ENV || globalThis.process?.env?.NODE_ENV) === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24, // 24 hours
        path: '/',
      });
    } catch (error) {
      // In Edge Runtime, cookies() might not be available in all contexts
      // This is handled gracefully - token is still returned for manual setting
    }

    return token;
  }

  /**
   * Get CSRF token from cookies (server-side only)
   */
  export async function getCSRFToken(): Promise<string | null> {
    try {
      const cookieStore = await cookies();
      return cookieStore.get(CSRF_COOKIE_NAME)?.value || null;
    } catch (_error) {
      // Edge Runtime context might not have cookies() available
      return null;
    }
  }

  /**
   * Endpoints that allow anonymous CSRF tokens
   * All other endpoints require authenticated tokens
   */
  const ANONYMOUS_TOKEN_ALLOWED_ENDPOINTS = [
    '/api/auth/register',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/contact', // Public contact forms
  ];

  /**
   * Endpoints that allow both anonymous AND authenticated CSRF tokens
   * These endpoints need to handle both logged-in and non-logged-in users
   */
  const DUAL_TOKEN_ALLOWED_ENDPOINTS = [
    '/api/auth/login', // Users might login while already authenticated (re-auth, account switching)
  ];

  /**
   * Check if an endpoint allows anonymous CSRF tokens
   */
  export function isAnonymousEndpoint(pathname: string): boolean {
    return ANONYMOUS_TOKEN_ALLOWED_ENDPOINTS.some(
      (endpoint) => pathname === endpoint || pathname.startsWith(`${endpoint}/`)
    );
  }

  /**
   * Check if an endpoint allows both anonymous and authenticated CSRF tokens
   */
  export function isDualTokenEndpoint(pathname: string): boolean {
    return DUAL_TOKEN_ALLOWED_ENDPOINTS.some(
      (endpoint) => pathname === endpoint || pathname.startsWith(`${endpoint}/`)
    );
  }

  /**
   * Verify CSRF token from request (unified validation logic)
   * Handles both anonymous and authenticated tokens appropriately
   */
  export async function verifyCSRFToken(request: NextRequest): Promise<boolean> {
    try {
      const headerToken = request.headers.get(CSRF_HEADER_NAME);
      const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
      const pathname = request.nextUrl.pathname;
      const isAnonymousPath = isAnonymousEndpoint(pathname);
      const isDualPath = isDualTokenEndpoint(pathname);

      if (!headerToken) {
        return false;
      }

      if (isAnonymousPath) {
        // For anonymous-only endpoints (register, forgot-password), validate against request fingerprint
        return await validateAnonymousToken(request, headerToken);
      } else if (isDualPath) {
        // For dual token endpoints (login), accept both anonymous and authenticated tokens
        try {
          const [encodedPayload] = headerToken.split('.');
          if (encodedPayload) {
            const payload = JSON.parse(atob(encodedPayload));

            if (payload.type === 'anonymous') {
              // Validate as anonymous token (no cookie required)
              return await validateAnonymousToken(request, headerToken);
            } else if (payload.type === 'authenticated') {
              // Validate as authenticated token (require cookie and signature validation)
              if (!cookieToken) {
                return false;
              }

              // Validate authenticated token signature
              const isTokenValid = await validateAuthenticatedToken(headerToken);
              if (!isTokenValid) {
                return false;
              }

              // Verify double-submit cookie pattern
              return constantTimeCompare(headerToken, cookieToken);
            }
          }
        } catch (parseError) {
          return false;
        }

        // If we get here, token type wasn't recognized
        return false;
      } else {
        // For authenticated endpoints, require both header and cookie tokens
        if (!cookieToken) {
          return false;
        }

        // Parse header token to determine type
        try {
          const [encodedPayload] = headerToken.split('.');
          if (encodedPayload) {
            const payload = JSON.parse(atob(encodedPayload));

            // Security check: prevent anonymous tokens on protected endpoints
            if (payload.type === 'anonymous') {
              return false;
            }

            // For authenticated tokens, validate signature and double-submit pattern
            if (payload.type === 'authenticated') {
              const isTokenValid = await validateAuthenticatedToken(headerToken);
              if (!isTokenValid) {
                return false;
              }

              // Verify double-submit cookie pattern (constant-time comparison)
              return constantTimeCompare(headerToken, cookieToken);
            }
          }
        } catch (_parseError) {
          // If token parsing fails, fall back to simple double-submit check
          // This handles legacy tokens during migration
        }

        // Fallback: simple double-submit pattern for legacy tokens
        return constantTimeCompare(headerToken, cookieToken);
      }
    } catch (_error) {
      return false;
    }
  }

  /**
   * Check if request method requires CSRF protection
   */
  export function requiresCSRFProtection(method: string): boolean {
    return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   */
  function constantTimeCompare(a: string, b: string): boolean {
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
  export function generateToken(): string {
    return nanoid(CSRF_TOKEN_LENGTH);
  }
