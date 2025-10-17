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

import { publicRoute } from '@/lib/api/route-handlers';
import { AuditLogger } from '@/lib/api/services/audit';
import { correlation, log } from '@/lib/logger';

/**
 * Custom Login Endpoint
 * Replaces NextAuth with enterprise-grade authentication
 */
const loginHandler = async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    await applyRateLimit(request, 'auth');

    const validatedData = await validateRequest(request, loginSchema);
    const { email, password, remember } = validatedData;

    const { extractRequestMetadata } = await import('@/lib/api/utils/request');
    const metadata = extractRequestMetadata(request);

    const lockoutStatus = await isAccountLocked(email);

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

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

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

    // Check if user is SSO-only (no password set)
    if (!user.password_hash) {
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

    const isValidPassword = await verifyPassword(password, user.password_hash);

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

    log.auth('password_verification', true, {
      userId: user.user_id,
      method: 'session',
    });

    await clearFailedAttempts(email);

    // CHECK MFA STATUS - Before creating full session
    const { getMFAStatus, beginAuthentication } = await import('@/lib/auth/webauthn');
    const { createMFATempToken } = await import('@/lib/auth/webauthn-temp-token');
    const { getMFASkipStatus } = await import('@/lib/auth/mfa-skip-tracker');

    const mfaStatus = await getMFAStatus(user.user_id);
    const skipStatus = await getMFASkipStatus(user.user_id);

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
      const { options, challenge_id } = await beginAuthentication(
        user.user_id,
        metadata.ipAddress,
        metadata.userAgent
      );

      const tempToken = await createMFATempToken(user.user_id, challenge_id);

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

      const duration = Date.now() - startTime;
      log.info('login password verification succeeded - mfa challenge issued', {
        operation: 'login',
        userId: user.user_id,
        status: 'mfa_required',
        credentialCount: mfaStatus.credential_count,
        rememberMe: remember,
        duration,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        component: 'auth',
      });

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

    // MFA not configured - check skip status
    const { generateAnonymousToken } = await import('@/lib/security/csrf-unified');
    const csrfToken = await generateAnonymousToken(request);

    // If no skips remaining, ENFORCE MFA setup (fail-closed security)
    if (skipStatus.skips_remaining <= 0) {
      const tempToken = await createMFATempToken(user.user_id);

      await AuditLogger.logAuth({
        action: 'mfa_setup_enforced',
        userId: user.user_id,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        metadata: {
          reason: 'skip_limit_exceeded',
          totalSkips: skipStatus.skip_count,
          correlationId: correlation.current(),
        },
      });

      const duration = Date.now() - startTime;
      log.info('login password verification succeeded - mfa setup enforced', {
        operation: 'login',
        userId: user.user_id,
        status: 'mfa_setup_enforced',
        skipsExhausted: true,
        totalSkips: skipStatus.skip_count,
        rememberMe: remember,
        duration,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        component: 'auth',
      });

      return createSuccessResponse(
        {
          status: 'mfa_setup_enforced',
          tempToken,
          user: {
            id: user.user_id,
            email: user.email,
            name: `${user.first_name} ${user.last_name}`,
          },
          csrfToken,
        },
        'MFA setup is now required to access your account'
      );
    }

    // Skips available - offer OPTIONAL setup with skip option
    const tempToken = await createMFATempToken(user.user_id);

    await AuditLogger.logAuth({
      action: 'mfa_setup_optional',
      userId: user.user_id,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      metadata: {
        reason: 'password_login_skip_available',
        skipsRemaining: skipStatus.skips_remaining,
        correlationId: correlation.current(),
      },
    });

    const duration = Date.now() - startTime;
    log.info('login password verification succeeded - mfa setup optional', {
      operation: 'login',
      userId: user.user_id,
      status: 'mfa_setup_optional',
      skipsRemaining: skipStatus.skips_remaining,
      skipCount: skipStatus.skip_count,
      rememberMe: remember,
      duration,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      component: 'auth',
    });

    return createSuccessResponse(
      {
        status: 'mfa_setup_optional',
        tempToken,
        user: {
          id: user.user_id,
          email: user.email,
          name: `${user.first_name} ${user.last_name}`,
        },
        skipsRemaining: skipStatus.skips_remaining,
        csrfToken,
      },
      'Passkey setup recommended for enhanced security'
    );
  } catch (error) {
    log.error('login failed', error, {
      operation: 'login',
      duration: Date.now() - startTime,
      component: 'auth',
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

// Export as public route (correlation ID automatically added by middleware)
export const POST = publicRoute(loginHandler, 'Authentication endpoint - must be public', {
  rateLimit: 'auth',
});
