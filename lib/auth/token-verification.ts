import { type JWTPayload, jwtVerify } from 'jose';
import { eq } from 'drizzle-orm';
import { db, token_blacklist } from '@/lib/db';
import { getJWTConfig } from '@/lib/env';
import { log } from '@/lib/logger';

/**
 * Token Verification Service
 * Centralized JWT token verification for all API routes
 *
 * SECURITY: JWT secrets remain module-scoped and are NOT exported
 * This prevents routes from directly accessing sensitive cryptographic material
 */

// SECURITY: Module-scoped secrets - NOT exported
const jwtConfig = getJWTConfig();
const ACCESS_TOKEN_SECRET = new TextEncoder().encode(jwtConfig.accessSecret);
const REFRESH_TOKEN_SECRET = new TextEncoder().encode(jwtConfig.refreshSecret);

/**
 * Structured token payload returned by verification functions
 */
export interface TokenPayload {
  userId: string;
  sessionId: string;
  jti: string;
  exp: number;
  iat: number;
  rememberMe?: boolean;
}

/**
 * Verify access token
 * Used for API authentication
 *
 * @param token - The access token to verify
 * @returns TokenPayload if valid, null if invalid/expired
 */
export async function verifyAccessToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, ACCESS_TOKEN_SECRET);

    // Check if token is blacklisted
    const jti = payload.jti as string;
    const [blacklisted] = await db
      .select()
      .from(token_blacklist)
      .where(eq(token_blacklist.jti, jti))
      .limit(1);

    if (blacklisted) {
      log.security('blacklisted_access_token_used', 'high', { jti });
      return null;
    }

    return {
      userId: payload.sub as string,
      sessionId: payload.session_id as string,
      jti: payload.jti as string,
      exp: payload.exp as number,
      iat: payload.iat as number,
    };
  } catch (error) {
    log.debug('Access token verification failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Verify refresh token
 * Used for token rotation and session management
 *
 * SECURITY: Checks token blacklist to prevent reuse attacks
 *
 * @param token - The refresh token to verify
 * @returns TokenPayload if valid, null if invalid/expired/blacklisted
 */
export async function verifyRefreshToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, REFRESH_TOKEN_SECRET);

    // Check if token is blacklisted
    const jti = payload.jti as string;
    const [blacklisted] = await db
      .select()
      .from(token_blacklist)
      .where(eq(token_blacklist.jti, jti))
      .limit(1);

    if (blacklisted) {
      log.security('blacklisted_refresh_token_used', 'high', { jti });
      return null;
    }

    return {
      userId: payload.sub as string,
      sessionId: payload.session_id as string,
      jti: payload.jti as string,
      exp: payload.exp as number,
      iat: payload.iat as number,
      ...(payload.remember_me !== undefined && { rememberMe: payload.remember_me as boolean }),
    };
  } catch (error) {
    log.debug('Refresh token verification failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Extract user ID from refresh token without full validation
 *
 * WARNING: Use ONLY for error logging and diagnostics
 * DO NOT use for authentication or authorization decisions
 *
 * This function does NOT check:
 * - Token expiration
 * - Token blacklist
 * - Token signature (verification still occurs but errors are ignored)
 *
 * @param token - The refresh token to extract user ID from
 * @returns User ID if extractable, null otherwise
 */
export async function extractUserIdUnsafe(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, REFRESH_TOKEN_SECRET);
    return payload.sub as string;
  } catch {
    return null;
  }
}

/**
 * Get raw JWT payload from refresh token
 * Used for extracting metadata like session_id, remember_me, etc.
 *
 * SECURITY: Still validates signature and expiry, but does NOT check blacklist
 * Use verifyRefreshToken() for full security validation
 *
 * @param token - The refresh token to decode
 * @returns JWT payload if valid, null if invalid
 */
export async function getRefreshTokenPayload(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, REFRESH_TOKEN_SECRET);
    return payload;
  } catch (error) {
    log.debug('Refresh token payload extraction failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}
