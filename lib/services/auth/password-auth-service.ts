/**
 * Password Authentication Service - Login Orchestration
 *
 * Provides complete password-based authentication flow orchestration.
 * Consolidates all login logic from /api/auth/login into a testable service.
 *
 * SECURITY FEATURES:
 * - Account lockout with progressive timeouts
 * - MFA enforcement with skip tracking
 * - SSO-only user detection
 * - Temp token generation for MFA flows
 * - Comprehensive audit logging
 *
 * REPLACES DIRECT LOGIC IN:
 * - /api/auth/login (300+ lines of inline orchestration)
 *
 * USAGE:
 * ```typescript
 * import { authenticateWithPassword } from '@/lib/services/auth/password-auth-service';
 *
 * // Authenticate user - NEVER returns 'success' directly
 * const result = await authenticateWithPassword({
 *   email: 'user@example.com',
 *   password: 'password123',
 *   remember: false,
 *   ipAddress: '192.168.1.1',
 *   userAgent: 'Mozilla/5.0...',
 *   request: nextRequest
 * });
 *
 * // Handle result based on status (always intermediate state)
 * if (result.status === 'mfa_required') {
 *   // MFA verification needed - user has passkeys configured
 *   // Client calls /api/auth/mfa/verify to complete login
 * } else if (result.status === 'mfa_setup_optional') {
 *   // MFA setup offered (with skip option)
 *   // Client calls /api/auth/mfa/skip or /api/auth/mfa/register/begin
 * } else if (result.status === 'mfa_setup_enforced') {
 *   // MFA setup mandatory (no skips left)
 *   // Client must call /api/auth/mfa/register/begin
 * }
 * ```
 */

import { clearFailedAttempts, recordFailedAttempt, verifyPassword } from '@/lib/auth/security';
import { createMFATempToken } from '@/lib/auth/webauthn-temp-token';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import { generateAnonymousToken } from '@/lib/security/csrf-unified';
import type { NextRequest } from 'next/server';
import {
  canUserAuthenticateWithPassword,
  getUserByEmail,
  UserLookupError,
  UserLookupErrorCode,
} from './user-lookup-service';
import { beginPasskeyVerification, getMFASkipStatus, getMFAStatus } from './mfa-service';
import { AuditLogger } from '@/lib/api/services/audit';
import { correlation } from '@/lib/logger';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Password authentication request
 */
export interface PasswordAuthRequest {
  email: string;
  password: string;
  remember: boolean;
  ipAddress: string;
  userAgent: string | null;
  request: NextRequest; // For CSRF token generation
}

/**
 * Authentication result status
 */
export enum AuthStatus {
  SUCCESS = 'success', // Login complete, session created
  MFA_REQUIRED = 'mfa_required', // MFA verification needed
  MFA_SETUP_OPTIONAL = 'mfa_setup_optional', // MFA setup offered (can skip)
  MFA_SETUP_ENFORCED = 'mfa_setup_enforced', // MFA setup mandatory (no skips)
}

/**
 * Base authentication result
 */
interface BaseAuthResult {
  status: AuthStatus;
  user: {
    id: string;
    email: string;
    name: string;
  };
  csrfToken: string;
}

/**
 * Success result (session created)
 *
 * SECURITY NOTE: This status is NEVER returned by password authentication.
 * SUCCESS is only returned by:
 * - MFA completion routes (/api/auth/mfa/verify, /api/auth/mfa/skip)
 * - MFA registration completion (/api/auth/mfa/register/complete)
 * - SSO/OIDC callback routes
 *
 * Password authentication ALWAYS returns an intermediate state requiring
 * additional user action (MFA verification or setup).
 *
 * @property {string} sessionId - Unique session identifier
 * @property {string} accessToken - Short-lived access token (15 min)
 * @property {string} refreshToken - Long-lived refresh token (7-30 days)
 * @property {string} expiresAt - ISO timestamp when access token expires
 * @property {boolean} rememberMe - Whether user selected "remember me" option
 */
export interface SuccessAuthResult extends BaseAuthResult {
  status: AuthStatus.SUCCESS;
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  rememberMe: boolean;
}

/**
 * MFA required result (passkey verification needed)
 */
export interface MFARequiredAuthResult extends BaseAuthResult {
  status: AuthStatus.MFA_REQUIRED;
  tempToken: string;
  challenge: unknown; // WebAuthn challenge
  challengeId: string;
}

/**
 * MFA setup optional result (can skip)
 */
export interface MFASetupOptionalAuthResult extends BaseAuthResult {
  status: AuthStatus.MFA_SETUP_OPTIONAL;
  tempToken: string;
  skipsRemaining: number;
}

/**
 * MFA setup enforced result (no skips left)
 */
export interface MFASetupEnforcedAuthResult extends BaseAuthResult {
  status: AuthStatus.MFA_SETUP_ENFORCED;
  tempToken: string;
}

/**
 * Union type for password authentication results
 * NOTE: SuccessAuthResult is NOT included because password authentication
 * NEVER returns SUCCESS directly. It always returns an intermediate state
 * requiring MFA verification or setup. SUCCESS is only returned by:
 * - /api/auth/mfa/verify, /api/auth/mfa/skip
 * - /api/auth/mfa/register/complete
 * - SSO/OIDC callback routes
 */
export type PasswordAuthResult =
  | MFARequiredAuthResult
  | MFASetupOptionalAuthResult
  | MFASetupEnforcedAuthResult;

// ============================================================================
// Core Authentication Function
// ============================================================================

/**
 * Authenticate user with email and password
 *
 * ORCHESTRATES:
 * 1. User lookup and validation
 * 2. Password verification
 * 3. Account lockout management
 * 4. MFA status checking
 * 5. MFA skip tracking
 * 6. Temp token or session creation
 *
 * REPLACES:
 * - /api/auth/login handler (entire flow)
 *
 * @param options - Authentication request
 * @returns Authentication result (varies by MFA status)
 * @throws {UserLookupError} If user validation fails
 * @throws {Error} If password verification fails
 *
 * @example
 * // Handle all authentication flows with discriminated union
 * const result = await authenticateWithPassword({
 *   email: 'user@example.com',
 *   password: 'password123',
 *   remember: false,
 *   ipAddress: '192.168.1.1',
 *   userAgent: 'Mozilla/5.0...',
 *   request: nextRequest
 * });
 *
 * // SECURITY: This function NEVER returns AuthStatus.SUCCESS
 * // It always returns an intermediate state requiring further user action
 * switch (result.status) {
 *   case AuthStatus.MFA_REQUIRED:
 *     // User has MFA configured - require passkey verification
 *     // Client must call /api/auth/mfa/verify to complete login
 *     return NextResponse.json({
 *       requiresMFA: true,
 *       challenge: result.challenge,
 *       tempToken: result.tempToken
 *     });
 *
 *   case AuthStatus.MFA_SETUP_OPTIONAL:
 *     // User can skip MFA setup (has remaining skips)
 *     // Client can call /api/auth/mfa/skip or /api/auth/mfa/register/begin
 *     return NextResponse.json({
 *       requiresMFASetup: true,
 *       canSkip: true,
 *       skipsRemaining: result.skipsRemaining,
 *       tempToken: result.tempToken
 *     });
 *
 *   case AuthStatus.MFA_SETUP_ENFORCED:
 *     // User must set up MFA (no skips remaining)
 *     // Client must call /api/auth/mfa/register/begin
 *     return NextResponse.json({
 *       requiresMFASetup: true,
 *       canSkip: false,
 *       tempToken: result.tempToken
 *     });
 * }
 */
export async function authenticateWithPassword(
  options: PasswordAuthRequest
): Promise<PasswordAuthResult> {
  const startTime = Date.now();
  const { email, password, remember, ipAddress, userAgent, request } = options;

  log.info('password authentication initiated', {
    operation: 'authenticate_with_password',
    email: email.replace(/(.{2}).*@/, '$1***@'),
    rememberMe: remember,
    component: 'auth',
  });

  try {
    // ===== STEP 1: User Lookup and Validation =====
    const user = await getUserByEmail(email);

    if (!user) {
      // Record failed attempt for non-existent user
      await recordFailedAttempt(email);

      await AuditLogger.logAuth({
        action: 'login_failed',
        ipAddress,
        userAgent: userAgent || undefined,
        metadata: {
          email,
          reason: 'user_not_found',
          correlationId: correlation.current(),
        },
      });

      log.auth('login_attempt', false, { reason: 'user_not_found' });
      throw new UserLookupError(
        UserLookupErrorCode.USER_NOT_FOUND,
        'Invalid email or password',
        { email }
      );
    }

    // Check if user is active
    if (!user.is_active) {
      await AuditLogger.logAuth({
        action: 'login_failed',
        userId: user.user_id,
        ipAddress,
        userAgent: userAgent || undefined,
        metadata: {
          email,
          reason: 'user_inactive',
          correlationId: correlation.current(),
        },
      });

      log.auth('login_attempt', false, { userId: user.user_id, reason: 'user_inactive' });
      throw new UserLookupError(UserLookupErrorCode.USER_INACTIVE, 'Account is inactive', {
        userId: user.user_id,
      });
    }

    // ===== STEP 2: Check if User is SSO-Only =====
    if (!canUserAuthenticateWithPassword(user)) {
      log.security('sso_only_user_password_attempt', 'medium', {
        action: 'password_login_blocked',
        userId: user.user_id,
        blocked: true,
        threat: 'authentication_bypass_attempt',
        reason: 'sso_only_user',
      });

      await AuditLogger.logAuth({
        action: 'login_failed',
        userId: user.user_id,
        ipAddress,
        userAgent: userAgent || undefined,
        metadata: {
          email,
          reason: 'sso_only_user_password_attempt',
          correlationId: correlation.current(),
        },
      });

      throw new UserLookupError(
        UserLookupErrorCode.SSO_ONLY_USER,
        'This account uses Single Sign-On. Please sign in with Microsoft.',
        { userId: user.user_id }
      );
    }

    // ===== STEP 3: Verify Password =====
    // At this point, we've verified user.password_hash exists via canUserAuthenticateWithPassword
    const passwordHash = user.password_hash;
    if (!passwordHash) {
      // This should never happen due to canUserAuthenticateWithPassword check
      throw new Error('Internal error: password hash missing for password-enabled user');
    }

    const isValidPassword = await verifyPassword(password, passwordHash);

    if (!isValidPassword) {
      // Password failure logging
      log.auth('login_attempt', false, {
        userId: user.user_id,
        reason: 'invalid_password',
      });

      log.security('authentication_failure', 'medium', {
        action: 'password_verification_failed',
        userId: user.user_id,
        threat: 'credential_attack',
        blocked: true,
      });

      // Record failed attempt
      const lockoutResult = await recordFailedAttempt(email);

      await AuditLogger.logAuth({
        action: 'login_failed',
        userId: user.user_id,
        ipAddress,
        userAgent: userAgent || undefined,
        metadata: {
          email,
          reason: 'invalid_password',
          accountLocked: lockoutResult.locked,
          correlationId: correlation.current(),
        },
      });

      throw new Error('Invalid email or password');
    }

    log.auth('password_verification', true, {
      userId: user.user_id,
      method: 'session',
    });

    // Clear failed attempts on successful password verification
    await clearFailedAttempts(email);

    // ===== STEP 4: Check MFA Status =====
    const mfaStatus = await getMFAStatus(user.user_id);
    const skipStatus = await getMFASkipStatus(user.user_id);

    // ===== EDGE CASE: MFA enabled but no active credentials =====
    if (mfaStatus.enabled && mfaStatus.credential_count === 0) {
      log.error('MFA enabled but no active credentials', {
        userId: user.user_id,
        mfaEnabled: mfaStatus.enabled,
        credentialCount: mfaStatus.credential_count,
      });

      await AuditLogger.logAuth({
        action: 'login_failed',
        userId: user.user_id,
        ipAddress,
        userAgent: userAgent || undefined,
        metadata: {
          reason: 'mfa_enabled_no_active_credentials',
          correlationId: correlation.current(),
        },
      });

      const totalDuration = Date.now() - startTime;
      log.api('POST /api/auth/login - MFA Locked', request, 403, totalDuration);

      throw new Error(
        'Your passkey authentication is unavailable. Please contact support to reset your account security.'
      );
    }

    // ===== FLOW 1: MFA Enabled with Active Credentials =====
    // User has configured MFA - require passkey verification before session creation
    if (mfaStatus.enabled && mfaStatus.credential_count > 0) {
      const { options: challenge, challenge_id } = await beginPasskeyVerification({
        userId: user.user_id,
        ipAddress,
        userAgent,
      });

      const tempToken = await createMFATempToken(user.user_id, challenge_id);
      const csrfToken = await generateAnonymousToken(request);

      await AuditLogger.logAuth({
        action: 'mfa_challenge_issued',
        userId: user.user_id,
        ipAddress,
        userAgent: userAgent || undefined,
        metadata: {
          challengeId: challenge_id.substring(0, 8),
          correlationId: correlation.current(),
        },
      });

      const duration = Date.now() - startTime;
      log.info('login password verification succeeded - mfa challenge issued', {
        operation: 'authenticate_with_password',
        userId: user.user_id,
        status: 'mfa_required',
        credentialCount: mfaStatus.credential_count,
        rememberMe: remember,
        duration,
        slow: duration > SLOW_THRESHOLDS.AUTH_OPERATION,
        ipAddress,
        userAgent: userAgent || 'unknown',
        component: 'auth',
      });

      return {
        status: AuthStatus.MFA_REQUIRED,
        tempToken,
        challenge,
        challengeId: challenge_id,
        csrfToken,
        user: {
          id: user.user_id,
          email: user.email,
          name: `${user.first_name} ${user.last_name}`,
        },
      };
    }

    // ===== FLOW 2: MFA Not Configured - Check Skip Status (Fail-Closed Security) =====
    // User hasn't set up MFA yet - enforce progressive MFA setup based on skip tracking
    // SECURITY: Never create session directly from password login without MFA checkpoint

    // If no skips remaining, ENFORCE MFA setup (fail-closed security)
    if (skipStatus.skips_remaining <= 0) {
      const tempToken = await createMFATempToken(user.user_id);
      const csrfToken = await generateAnonymousToken(request);

      await AuditLogger.logAuth({
        action: 'mfa_setup_enforced',
        userId: user.user_id,
        ipAddress,
        userAgent: userAgent || undefined,
        metadata: {
          reason: 'skip_limit_exceeded',
          totalSkips: skipStatus.skip_count,
          correlationId: correlation.current(),
        },
      });

      const duration = Date.now() - startTime;
      log.info('login password verification succeeded - mfa setup enforced', {
        operation: 'authenticate_with_password',
        userId: user.user_id,
        status: 'mfa_setup_enforced',
        skipsExhausted: true,
        totalSkips: skipStatus.skip_count,
        rememberMe: remember,
        duration,
        slow: duration > SLOW_THRESHOLDS.AUTH_OPERATION,
        ipAddress,
        userAgent: userAgent || 'unknown',
        component: 'auth',
      });

      return {
        status: AuthStatus.MFA_SETUP_ENFORCED,
        tempToken,
        user: {
          id: user.user_id,
          email: user.email,
          name: `${user.first_name} ${user.last_name}`,
        },
        csrfToken,
      };
    }

    // ===== FLOW 3: Skips Available - Offer OPTIONAL MFA Setup =====
    // User can skip MFA setup, but it's recommended for enhanced security
    const tempToken = await createMFATempToken(user.user_id);
    const csrfToken = await generateAnonymousToken(request);

    await AuditLogger.logAuth({
      action: 'mfa_setup_optional',
      userId: user.user_id,
      ipAddress,
      userAgent: userAgent || undefined,
      metadata: {
        reason: 'password_login_skip_available',
        skipsRemaining: skipStatus.skips_remaining,
        correlationId: correlation.current(),
      },
    });

    const duration = Date.now() - startTime;
    log.info('login password verification succeeded - mfa setup optional', {
      operation: 'authenticate_with_password',
      userId: user.user_id,
      status: 'mfa_setup_optional',
      skipsRemaining: skipStatus.skips_remaining,
      skipCount: skipStatus.skip_count,
      rememberMe: remember,
      duration,
      slow: duration > SLOW_THRESHOLDS.AUTH_OPERATION,
      ipAddress,
      userAgent: userAgent || 'unknown',
      component: 'auth',
    });

    return {
      status: AuthStatus.MFA_SETUP_OPTIONAL,
      tempToken,
      user: {
        id: user.user_id,
        email: user.email,
        name: `${user.first_name} ${user.last_name}`,
      },
      skipsRemaining: skipStatus.skips_remaining,
      csrfToken,
    };
  } catch (error) {
    log.error('password authentication failed', error, {
      operation: 'authenticate_with_password',
      email: email.replace(/(.{2}).*@/, '$1***@'),
      duration: Date.now() - startTime,
      component: 'auth',
    });

    // Re-throw the error for the route handler to handle
    throw error;
  }
}
