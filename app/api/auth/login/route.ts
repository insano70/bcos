import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { applyRateLimit } from '@/lib/api/middleware/rate-limit';
import { validateRequest } from '@/lib/api/middleware/validation';
import { AuthenticationError, createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import {
  clearFailedAttempts,
  isAccountLocked,
  recordFailedAttempt,
  verifyPassword,
} from '@/lib/auth/security';
import { db, users } from '@/lib/db';
import { loginSchema } from '@/lib/validations/auth';

// Force dynamic rendering for this API route
export const dynamic = 'force-dynamic';

import { publicRoute } from '@/lib/api/route-handler';
import { AuditLogger } from '@/lib/api/services/audit';
import { correlation, log } from '@/lib/logger';

/**
 * Custom Login Endpoint
 * Replaces NextAuth with enterprise-grade authentication
 */
const loginHandler = async (request: NextRequest) => {
  const startTime = Date.now();

  // Log API request
  log.api('POST /api/auth/login - Login attempt', request, 0, 0);

  try {
    // Apply rate limiting
    const rateLimitStartTime = Date.now();
    await applyRateLimit(request, 'auth');
    log.info('Rate limit check completed', { duration: Date.now() - rateLimitStartTime });

    // Validate request data
    const validationStartTime = Date.now();
    const validatedData = await validateRequest(request, loginSchema);
    const { email, password, remember } = validatedData;
    log.info('Request validation completed', { duration: Date.now() - validationStartTime });

    // Validation success logging
    log.auth('login_validation', true, {
      method: 'session',
      sessionDuration: remember ? 86400 * 30 : 86400,
      emailMasked: email.replace(/(.{2}).*@/, '$1***@'),
      rememberMe: remember,
    });

    // Extract device info
    const { extractRequestMetadata } = await import('@/lib/api/utils/request');
    const metadata = extractRequestMetadata(request);

    // Check account lockout
    const lockoutStartTime = Date.now();
    const lockoutStatus = await isAccountLocked(email);
    log.info('Account lockout check completed', { duration: Date.now() - lockoutStartTime });

    if (lockoutStatus.locked) {
      // Account lockout logging
      log.auth('login_attempt', false, {
        reason: 'account_locked',
        lockedUntil: lockoutStatus.lockedUntil,
      });

      log.security('account_lockout_triggered', 'medium', {
        blocked: true,
        reason: 'multiple_failed_attempts',
        action: 'login_blocked',
      });

      await AuditLogger.logAuth({
        action: 'account_locked',
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        metadata: {
          email,
          lockedUntil: lockoutStatus.lockedUntil,
          correlationId: correlation.current(),
        },
      });

      throw AuthenticationError(
        'Account temporarily locked due to multiple failed attempts. Please try again later.'
      );
    }

    // Fetch user from database
    const dbStartTime = Date.now();
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    log.db('SELECT', 'users', Date.now() - dbStartTime, { rowCount: user ? 1 : 0 });

    if (!user) {
      // Security logging for non-existent user attempts
      log.security('authentication_failure', 'medium', {
        action: 'login_attempt_nonexistent_user',
        blocked: true,
        threat: 'credential_attack',
        reason: 'user_not_found',
      });

      log.warn('Login attempt with non-existent user', {
        email: email.replace(/(.{2}).*@/, '$1***@'),
      });

      // Record failed attempt
      await recordFailedAttempt(email);

      await AuditLogger.logAuth({
        action: 'login_failed',
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        metadata: {
          email,
          reason: 'user_not_found',
          correlationId: correlation.current(),
        },
      });

      log.auth('login_attempt', false, { reason: 'user_not_found' });
      throw AuthenticationError('Invalid email or password');
    }

    if (!user.is_active) {
      log.warn('Login attempt with inactive user', {
        userId: user.user_id,
        email: email.replace(/(.{2}).*@/, '$1***@'),
      });

      await AuditLogger.logAuth({
        action: 'login_failed',
        userId: user.user_id,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        metadata: {
          email,
          reason: 'user_inactive',
          correlationId: correlation.current(),
        },
      });

      log.auth('login_attempt', false, { userId: user.user_id, reason: 'user_inactive' });
      throw AuthenticationError('Account is inactive');
    }

    log.debug('User found and active', {
      userId: user.user_id,
      emailVerified: user.email_verified,
    });

    // Check if user is SSO-only (no password set)
    if (!user.password_hash) {
      log.warn('Password login attempted for SSO-only user', {
        userId: user.user_id,
        email: email.replace(/(.{2}).*@/, '$1***@'),
      });

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
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        metadata: {
          email,
          reason: 'sso_only_user_password_attempt',
          correlationId: correlation.current(),
        },
      });

      throw AuthenticationError('This account uses Single Sign-On. Please sign in with Microsoft.');
    }

    // Verify password
    const passwordStartTime = Date.now();
    const isValidPassword = await verifyPassword(password, user.password_hash);
    log.info('Password verification completed', { duration: Date.now() - passwordStartTime });

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
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        metadata: {
          email,
          reason: 'invalid_password',
          accountLocked: lockoutResult.locked,
          correlationId: correlation.current(),
        },
      });

      throw AuthenticationError('Invalid email or password');
    }

    // Authentication success logging
    log.auth('password_verification', true, {
      userId: user.user_id,
      method: 'session',
    });

    log.info('Password verification successful', {
      userId: user.user_id,
    });

    // Clear failed attempts on successful login
    await clearFailedAttempts(email);

    // CHECK MFA STATUS - Before creating full session
    const { getMFAStatus, beginAuthentication } = await import('@/lib/auth/webauthn');
    const { createMFATempToken } = await import('@/lib/auth/webauthn-temp-token');

    const mfaStatus = await getMFAStatus(user.user_id);

    // EDGE CASE: MFA enabled but all credentials disabled
    // This can happen if passkeys were disabled due to security issues
    if (mfaStatus.enabled && mfaStatus.credential_count === 0) {
      log.error('MFA enabled but no active credentials', {
        userId: user.user_id,
        mfaEnabled: mfaStatus.enabled,
        credentialCount: mfaStatus.credential_count,
      });

      await AuditLogger.logAuth({
        action: 'login_failed',
        userId: user.user_id,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        metadata: {
          reason: 'mfa_enabled_no_active_credentials',
          correlationId: correlation.current(),
        },
      });

      const totalDuration = Date.now() - startTime;
      log.api('POST /api/auth/login - MFA Locked', request, 403, totalDuration);

      throw AuthenticationError(
        'Your passkey authentication is unavailable. Please contact support to reset your account security.'
      );
    }

    // If MFA is enabled with active credentials, require passkey verification
    if (mfaStatus.enabled && mfaStatus.credential_count > 0) {
      log.info('MFA verification required for user', {
        userId: user.user_id,
        credentialCount: mfaStatus.credential_count,
      });

      // Generate authentication challenge
      const { options, challenge_id } = await beginAuthentication(
        user.user_id,
        metadata.ipAddress,
        metadata.userAgent
      );

      // Create temporary MFA token (NOT a full session)
      const tempToken = await createMFATempToken(user.user_id, challenge_id);

      // Generate anonymous CSRF token for MFA requests
      const { generateAnonymousToken } = await import('@/lib/security/csrf-unified');
      const csrfToken = await generateAnonymousToken(request);

      await AuditLogger.logAuth({
        action: 'mfa_challenge_issued',
        userId: user.user_id,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        metadata: {
          challengeId: challenge_id.substring(0, 8),
          correlationId: correlation.current(),
        },
      });

      const totalDuration = Date.now() - startTime;
      log.api('POST /api/auth/login - MFA Required', request, 200, totalDuration);

      // Return MFA challenge response with temp token and CSRF (NOT a session)
      return createSuccessResponse(
        {
          status: 'mfa_required',
          tempToken,
          challenge: options,
          challengeId: challenge_id,
          csrfToken,
        },
        'MFA verification required'
      );
    }

    // Password users require MFA setup if not yet configured
    log.info('MFA setup required for password user', {
      userId: user.user_id,
      mfaEnabled: mfaStatus.enabled,
      credentialCount: mfaStatus.credential_count,
    });

    // Create temporary MFA token for setup (NOT a full session)
    const tempToken = await createMFATempToken(user.user_id);

    // Generate anonymous CSRF token for MFA requests
    const { generateAnonymousToken } = await import('@/lib/security/csrf-unified');
    const csrfToken = await generateAnonymousToken(request);

    await AuditLogger.logAuth({
      action: 'mfa_setup_required',
      userId: user.user_id,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      metadata: {
        reason: 'password_login_requires_mfa',
        correlationId: correlation.current(),
      },
    });

    const totalDuration = Date.now() - startTime;
    log.api('POST /api/auth/login - MFA Setup Required', request, 200, totalDuration);

    // Return MFA setup required response with temp token and CSRF (NOT a session)
    return createSuccessResponse(
      {
        status: 'mfa_setup_required',
        tempToken,
        user: {
          id: user.user_id,
          email: user.email,
          name: `${user.first_name} ${user.last_name}`,
        },
        csrfToken,
      },
      'Passkey setup required for password login'
    );
  } catch (error) {
    const totalDuration = Date.now() - startTime;

    log.error('Login failed with error', error, {
      totalDuration,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });

    log.api('POST /api/auth/login - Error', request, 500, totalDuration);

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// Export as public route (correlation ID automatically added by middleware)
export const POST = publicRoute(loginHandler, 'Authentication endpoint - must be public', {
  rateLimit: 'auth',
});
