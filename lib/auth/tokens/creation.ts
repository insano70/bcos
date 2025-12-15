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
import { authCache, rbacCache } from '@/lib/cache';
import { db, refresh_tokens } from '@/lib/db';
import { log } from '@/lib/logger';
import { getCachedUserContextSafe } from '@/lib/rbac/cached-user-context';
import {
  ACCESS_TOKEN_DURATION,
  type DeviceInfo,
  type EnhancedAccessTokenPayload,
  type OrgAccessClaim,
  REFRESH_TOKEN_REMEMBER_ME,
  REFRESH_TOKEN_STANDARD,
  type TokenPair,
  type TokenRBACData,
} from './types';
import {
  createSessionRecord,
  enforceSessionLimit,
  generateSessionId,
} from './internal/session-manager';
import { logLoginAttempt } from './internal/login-tracker';

/**
 * Fetch RBAC data needed for enhanced token claims
 *
 * PERFORMANCE: This adds ~50-100ms to login, but saves 70-170ms on EVERY subsequent request.
 * Net benefit: Significant for any session with >1 API call.
 *
 * @param userId - User ID to fetch RBAC data for
 * @returns TokenRBACData or null if user context unavailable
 */
async function fetchTokenRBACData(userId: string): Promise<TokenRBACData | null> {
  try {
    const userContext = await getCachedUserContextSafe(userId);
    if (!userContext) {
      log.warn('Could not fetch user context for token RBAC claims', {
        userId,
        component: 'token-creation',
      });
      return null;
    }

    // Get role versions from cache for invalidation detection
    const rolesWithVersions = await Promise.all(
      userContext.roles.map(async (role) => {
        const cached = await rbacCache.getRolePermissions(role.role_id);
        return {
          role_id: role.role_id,
          name: role.name,
          version: cached?.version ?? 1,
        };
      })
    );

    return {
      is_super_admin: userContext.is_super_admin,
      roles: rolesWithVersions,
      primary_organization_id: userContext.current_organization_id ?? null,
      organization_admin_for: userContext.organization_admin_for,
      direct_organization_ids: userContext.organizations.map((o) => o.organization_id),
      provider_uid: userContext.provider_uid,
      email_verified: userContext.email_verified,
    };
  } catch (error) {
    log.error(
      'Failed to fetch RBAC data for token',
      error instanceof Error ? error : new Error(String(error)),
      {
        userId,
        component: 'token-creation',
      }
    );
    return null;
  }
}

/**
 * Build organization access claim for JWT
 *
 * Creates a compact representation of organization access that the server can interpret:
 * - Super admins: { type: 'all' } - bypasses org filtering entirely
 * - Normal users with <=10 orgs: { type: 'hierarchy', root_ids: [...] } - server expands hierarchy
 * - Users with many orgs: { type: 'direct', org_ids: [...] } - explicit list
 *
 * @param rbacData - RBAC data containing org membership info
 * @returns Compact organization access claim
 */
function buildOrgAccessClaim(rbacData: TokenRBACData): OrgAccessClaim {
  if (rbacData.is_super_admin) {
    return { type: 'all' };
  }

  // For most users, store root org IDs - server expands hierarchy from cache
  // Threshold of 10 keeps token size reasonable while covering typical multi-org users
  if (rbacData.direct_organization_ids.length <= 10) {
    return { type: 'hierarchy', root_ids: rbacData.direct_organization_ids };
  }

  // Fallback for users with many direct org memberships
  return { type: 'direct', org_ids: rbacData.direct_organization_ids };
}

/**
 * Build enhanced access token payload with RBAC claims
 *
 * @param userId - User ID
 * @param sessionId - Session ID
 * @param now - Current timestamp
 * @param rbacData - RBAC data (or null for legacy token)
 * @param user - User data from cache
 * @returns Enhanced JWT payload
 */
function buildEnhancedAccessTokenPayload(
  userId: string,
  sessionId: string,
  now: Date,
  rbacData: TokenRBACData | null,
  user: { email: string; first_name: string; last_name: string } | null
): EnhancedAccessTokenPayload {
  return {
    // Standard JWT claims
    sub: userId,
    jti: nanoid(),
    session_id: sessionId,
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor((now.getTime() + ACCESS_TOKEN_DURATION) / 1000),

    // User identification
    email: user?.email ?? '',
    first_name: user?.first_name ?? '',
    last_name: user?.last_name ?? '',
    email_verified: rbacData?.email_verified ?? false,

    // RBAC claims
    is_super_admin: rbacData?.is_super_admin ?? false,
    role_ids: rbacData?.roles.map((r) => r.role_id) ?? [],
    roles_version:
      rbacData?.roles.reduce(
        (acc, r) => {
          acc[r.role_id] = r.version;
          return acc;
        },
        {} as Record<string, number>
      ) ?? {},

    // Organization access
    primary_org_id: rbacData?.primary_organization_id ?? null,
    org_admin_for: rbacData?.organization_admin_for ?? [],
    org_access: rbacData ? buildOrgAccessClaim(rbacData) : { type: 'direct', org_ids: [] },

    // Analytics
    provider_uid: rbacData?.provider_uid,
  };
}

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

  // Fetch RBAC data for enhanced token claims (adds ~50-100ms but saves on every subsequent request)
  const rbacData = await fetchTokenRBACData(userId);

  // Fetch user data from cache for token claims
  const user = await authCache.getUser(userId);

  // Build enhanced access token payload with RBAC claims
  const accessTokenPayload = buildEnhancedAccessTokenPayload(
    userId,
    sessionId,
    now,
    rbacData,
    user ? { email: user.email, first_name: user.first_name, last_name: user.last_name } : null
  );

  log.debug('Creating enhanced access token', {
    userId,
    hasRbacData: !!rbacData,
    roleCount: rbacData?.roles.length ?? 0,
    orgAccessType: accessTokenPayload.org_access.type,
    isSuperAdmin: accessTokenPayload.is_super_admin,
    component: 'token-creation',
  });

  const accessToken = await new SignJWT(accessTokenPayload as unknown as Record<string, unknown>)
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
    refreshTokenExpiresAt: refreshExpiresAt,
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
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Export helper functions for use in refresh.ts
export { fetchTokenRBACData, buildEnhancedAccessTokenPayload };
