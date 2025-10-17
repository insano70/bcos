/**
 * Temporary MFA Token Manager
 * Creates short-lived tokens for MFA authentication flow
 *
 * Security Features:
 * - 5-minute expiration
 * - Limited scope (only for MFA completion)
 * - Cannot be used for API access
 * - One-time use via challenge_id binding
 */

import { jwtVerify, SignJWT } from 'jose';
import { log } from '@/lib/logger';
import type { MFATempTokenPayload } from '@/lib/types/webauthn';

/**
 * Token duration: 5 minutes
 */
const TEMP_TOKEN_DURATION_MS = 5 * 60 * 1000;

/**
 * Get JWT secret for temp tokens
 * Uses dedicated MFA_TEMP_TOKEN_SECRET for security isolation
 */
function getTempTokenSecret(): Uint8Array {
  const secret = process.env.MFA_TEMP_TOKEN_SECRET;

  if (!secret) {
    throw new Error('MFA_TEMP_TOKEN_SECRET environment variable is required');
  }

  if (secret.length < 32) {
    throw new Error('MFA_TEMP_TOKEN_SECRET must be at least 32 characters');
  }

  return new TextEncoder().encode(secret);
}

/**
 * Create temporary MFA token for authentication flow
 * @param userId User ID
 * @param challengeId Optional challenge ID for authentication flow
 * @returns Temporary JWT token
 */
export async function createMFATempToken(userId: string, challengeId?: string): Promise<string> {
  const now = Date.now();
  const exp = Math.floor((now + TEMP_TOKEN_DURATION_MS) / 1000);
  const iat = Math.floor(now / 1000);

  const payload = {
    sub: userId,
    type: 'mfa_pending' as const,
    exp,
    iat,
    ...(challengeId && { challenge_id: challengeId }),
  };

  const token = await new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .sign(getTempTokenSecret());

  log.debug('MFA temp token created', {
    userId,
    expiresIn: TEMP_TOKEN_DURATION_MS / 1000,
    hasChallengeId: !!challengeId,
  });

  return token;
}

/**
 * Validate temporary MFA token
 * @param token Temporary token to validate
 * @returns Decoded payload if valid, null otherwise
 */
export async function validateMFATempToken(token: string): Promise<MFATempTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getTempTokenSecret());

    // Verify token type and required fields
    if (
      payload.type !== 'mfa_pending' ||
      typeof payload.sub !== 'string' ||
      typeof payload.exp !== 'number' ||
      typeof payload.iat !== 'number'
    ) {
      log.warn('Invalid MFA temp token structure', {
        type: payload.type,
        hasSub: !!payload.sub,
        hasExp: !!payload.exp,
        hasIat: !!payload.iat,
      });
      return null;
    }

    // Type Safety Note: This double assertion is necessary because JWT decode returns
    // a generic payload object. We've validated the structure above with runtime checks,
    // so this assertion is safe. This is an acceptable use case for JWT token validation
    // where runtime validation precedes type assertion.
    return payload as unknown as MFATempTokenPayload;
  } catch (error) {
    log.debug('MFA temp token validation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Extract temp token from Authorization header or Cookie
 * @param request Request object with headers
 * @returns Token string or null
 */
export function extractMFATempToken(request: Request): string | null {
  // Try Authorization header first
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Try cookie as fallback
  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';');
    const tempTokenCookie = cookies
      .find((cookie) => cookie.trim().startsWith('mfa-temp-token='))
      ?.split('=')[1];

    if (tempTokenCookie) {
      return tempTokenCookie;
    }
  }

  return null;
}

/**
 * Require valid MFA temp token (middleware helper)
 * @param request Request object
 * @returns Validated payload
 * @throws Error if token is invalid or missing
 */
export async function requireMFATempToken(request: Request): Promise<MFATempTokenPayload> {
  const token = extractMFATempToken(request);

  if (!token) {
    throw new Error('MFA authentication required');
  }

  const payload = await validateMFATempToken(token);

  if (!payload) {
    throw new Error('Invalid or expired MFA token');
  }

  return payload;
}
