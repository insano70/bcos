/**
 * Token Creation Module
 *
 * Handles initial token pair creation on authentication.
 * Generates JWT access and refresh tokens, creates session records.
 *
 * SECURITY FEATURES:
 * - Concurrent session limit enforcement
 * - Device fingerprinting and tracking
 * - Secure token storage (hashed)
 * - Comprehensive audit logging
 *
 * ARCHITECTURE:
 * - Stateless access tokens (15 minutes)
 * - Stateful refresh tokens (7-30 days, database-backed)
 * - Session-based tracking for device management
 *
 * USAGE:
 * ```typescript
 * import { createTokenPair } from '@/lib/auth/tokens/creation';
 *
 * const tokenPair = await createTokenPair(
 *   userId,
 *   deviceInfo,
 *   rememberMe,
 *   email,
 *   'password'
 * );
 * ```
 *
 * @module lib/auth/tokens/creation
 */

import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import { SignJWT } from 'jose';
import { AuditLogger } from '@/lib/api/services/audit';
import { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET } from '@/lib/auth/jwt-secrets';
import { db, refresh_tokens } from '@/lib/db';
import {
  ACCESS_TOKEN_DURATION,
  type DeviceInfo,
  REFRESH_TOKEN_REMEMBER_ME,
  REFRESH_TOKEN_STANDARD,
  type TokenPair,
} from './types';
import {
  createSessionRecord,
  enforceSessionLimit,
  generateSessionId,
} from './internal/session-manager';
import { logLoginAttempt } from './internal/login-tracker';

/**
 * Create initial token pair on login
 *
 * Generates complete authentication state:
 * - 15-minute access token (JWT)
 * - 7-30 day refresh token (JWT + database record)
 * - Session record with device tracking
 * - Login attempt audit log
 *
 * FLOW:
 * 1. Enforce concurrent session limit (revoke oldest if needed)
 * 2. Generate session ID
 * 3. Create access token JWT
 * 4. Create refresh token JWT
 * 5. Store refresh token in database (hashed)
 * 6. Create session record
 * 7. Log login attempt
 * 8. Audit log authentication
 *
 * SECURITY:
 * - Token hash stored (not plaintext)
 * - Device fingerprinting binds token to device
 * - Session limits prevent token accumulation
 * - Comprehensive audit trail
 *
 * @param userId - User ID
 * @param deviceInfo - Device identification data
 * @param rememberMe - Extended session (30 days vs 7 days)
 * @param email - User email (for audit log)
 * @param authMethod - Authentication method ('password', 'saml', 'webauthn')
 * @returns Token pair with access token, refresh token, expiration, session ID
 *
 * @example
 * const tokenPair = await createTokenPair(
 *   'user-123',
 *   {
 *     ipAddress: '192.168.1.1',
 *     userAgent: 'Mozilla/5.0...',
 *     fingerprint: 'abc123...',
 *     deviceName: 'Chrome Browser'
 *   },
 *   false,
 *   'user@example.com',
 *   'password'
 * );
 *
 * // Returns:
 * // {
 * //   accessToken: 'eyJhbGc...',
 * //   refreshToken: 'eyJhbGc...',
 * //   expiresAt: Date,
 * //   sessionId: 'abc123...'
 * // }
 */
export async function createTokenPair(
  userId: string,
  deviceInfo: DeviceInfo,
  rememberMe: boolean = false,
  email?: string,
  authMethod?: string
): Promise<TokenPair> {
  const now = new Date();

  // Enforce concurrent session limit (revoke oldest session if needed)
  await enforceSessionLimit(userId);

  // Generate unique identifiers
  const sessionId = generateSessionId();
  const refreshTokenId = nanoid(32);

  // Create access token (15 minutes, stateless)
  const accessTokenPayload = {
    sub: userId,
    jti: nanoid(), // Unique JWT ID for blacklist capability
    session_id: sessionId,
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor((now.getTime() + ACCESS_TOKEN_DURATION) / 1000),
  };

  const accessToken = await new SignJWT(accessTokenPayload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .sign(ACCESS_TOKEN_SECRET);

  // Create refresh token (7-30 days, stateful)
  const refreshTokenDuration = rememberMe ? REFRESH_TOKEN_REMEMBER_ME : REFRESH_TOKEN_STANDARD;
  const refreshExpiresAt = new Date(now.getTime() + refreshTokenDuration);

  const refreshTokenPayload = {
    sub: userId,
    jti: refreshTokenId,
    session_id: sessionId,
    remember_me: rememberMe,
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(refreshExpiresAt.getTime() / 1000),
  };

  const refreshToken = await new SignJWT(refreshTokenPayload)
    .setProtectedHeader({ alg: 'HS256', typ: 'REFRESH' })
    .sign(REFRESH_TOKEN_SECRET);

  // Store refresh token in database (hashed for security)
  await db.insert(refresh_tokens).values({
    token_id: refreshTokenId,
    user_id: userId,
    token_hash: hashToken(refreshToken),
    device_fingerprint: deviceInfo.fingerprint,
    ip_address: deviceInfo.ipAddress,
    user_agent: deviceInfo.userAgent,
    remember_me: rememberMe,
    expires_at: refreshExpiresAt,
    rotation_count: 0,
  });

  // Create session record
  await createSessionRecord({
    sessionId,
    userId,
    refreshTokenId,
    deviceInfo,
    rememberMe,
  });

  // Log successful login attempt
  await logLoginAttempt({
    email: email || '',
    userId,
    deviceInfo,
    success: true,
    rememberMe,
    sessionId,
  });

  // Audit log authentication event
  await AuditLogger.logAuth({
    action: 'login',
    userId,
    email,
    ipAddress: deviceInfo.ipAddress,
    userAgent: deviceInfo.userAgent,
    metadata: {
      authMethod,
      sessionId,
      refreshTokenId,
      rememberMe,
      deviceFingerprint: deviceInfo.fingerprint,
      deviceName: deviceInfo.deviceName,
    },
  });

  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(now.getTime() + ACCESS_TOKEN_DURATION),
    sessionId,
  };
}

/**
 * Hash token for secure storage
 *
 * Uses SHA-256 to hash tokens before database storage.
 * Prevents token leakage from database compromise.
 *
 * @param token - Token to hash
 * @returns SHA-256 hex digest
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
