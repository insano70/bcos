/**
 * POST /api/auth/mfa/skip
 * Skip MFA setup and create session
 *
 * Authentication: Requires temp token from login
 * Security: Rate limited, CSRF protected, decrements skip counter
 * Side Effects: Creates full session with cookies, records skip in audit log
 *
 * Flow:
 * 1. Validate temp token (user must have passed password authentication)
 * 2. Check skip counter (fail if exhausted)
 * 3. Record skip (decrement counter, update timestamps)
 * 4. Create full session (access token + refresh token)
 * 5. Return session data to client
 */

import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { publicRoute } from '@/lib/api/route-handlers';
import { COOKIE_NAMES } from '@/lib/auth/cookie-names';
import { requireMFATempToken } from '@/lib/auth/webauthn-temp-token';
import { correlation, log } from '@/lib/logger';
import { getCachedUserContextSafe } from '@/lib/rbac/cached-user-context';
import { setCSRFToken } from '@/lib/security/csrf-unified';
import { recordMFASkip } from '@/lib/services/auth/mfa-service';
import { createAuthSession } from '@/lib/services/auth/session-manager-service';
import { getUserById } from '@/lib/services/auth/user-lookup-service';

export const dynamic = 'force-dynamic';

const handler = async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    // Rate limit already applied by publicRoute wrapper - no need to apply here

    // Verify temp token (user must have completed password authentication)
    const tempPayload = await requireMFATempToken(request);
    const userId = tempPayload.sub;

    const { extractRequestMetadata } = await import('@/lib/api/utils/request');
    const metadata = extractRequestMetadata(request);

    // Record skip and get remaining count (using service layer)
    // This will throw if no skips remaining (fail-closed security)
    const skipResult = await recordMFASkip(userId, metadata.ipAddress, metadata.userAgent);

    // Fetch user details using service layer
    const user = await getUserById(userId);

    if (!user || !user.is_active) {
      throw new Error('User account is inactive');
    }

    // Build device info for session creation
    const { generateDeviceFingerprint, generateDeviceName } = await import(
      '@/lib/auth/tokens'
    );
    const deviceFingerprint = generateDeviceFingerprint(
      metadata.ipAddress,
      metadata.userAgent || 'unknown'
    );
    const deviceName = generateDeviceName(metadata.userAgent || 'unknown');

    const deviceInfo = {
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent || 'unknown',
      fingerprint: deviceFingerprint,
      deviceName,
    };

    // Create session using service layer (7-day session by default)
    const tokenPair = await createAuthSession({
      userId: user.user_id,
      deviceInfo,
      rememberMe: false,
      email: user.email,
    });

    // Set secure httpOnly cookies
    const cookieStore = await cookies();
    const isSecureEnvironment = process.env.NODE_ENV === 'production';
    const maxAge = 7 * 24 * 60 * 60; // 7 days

    cookieStore.set(COOKIE_NAMES.REFRESH_TOKEN, tokenPair.refreshToken, {
      httpOnly: true,
      secure: isSecureEnvironment,
      sameSite: 'strict',
      path: '/',
      maxAge,
    });

    cookieStore.set(COOKIE_NAMES.ACCESS_TOKEN, tokenPair.accessToken, {
      httpOnly: true,
      secure: isSecureEnvironment,
      sameSite: 'strict',
      path: '/',
      maxAge: 15 * 60, // 15 minutes
    });

    // Get user context for RBAC
    const userContext = await getCachedUserContextSafe(user.user_id);
    const userRoles = userContext?.roles?.map((r) => r.name) || [];
    const primaryRole = userRoles.length > 0 ? userRoles[0] : 'user';

    // Generate CSRF token
    const csrfToken = await setCSRFToken(user.user_id);

    const duration = Date.now() - startTime;
    log.info('mfa setup skipped - session created', {
      operation: 'mfa_skip',
      userId: user.user_id,
      skipsRemaining: skipResult.skipsRemaining,
      sessionCreated: true,
      sessionId: tokenPair.sessionId,
      duration,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      correlationId: correlation.current(),
      component: 'auth',
    });

    const skipsRemainingText =
      skipResult.skipsRemaining === 1
        ? '1 skip remaining'
        : `${skipResult.skipsRemaining} skips remaining`;

    return createSuccessResponse(
      {
        success: true,
        accessToken: tokenPair.accessToken,
        sessionId: tokenPair.sessionId,
        expiresAt: tokenPair.expiresAt.toISOString(),
        skipsRemaining: skipResult.skipsRemaining,
        user: {
          id: user.user_id,
          email: user.email,
          name: `${user.first_name} ${user.last_name}`,
          firstName: user.first_name,
          lastName: user.last_name,
          role: primaryRole,
          emailVerified: user.email_verified,
          roles: userRoles,
          permissions: userContext?.all_permissions?.map((p) => p.name) || [],
        },
        csrfToken,
      },
      `MFA setup skipped. You have ${skipsRemainingText}.`
    );
  } catch (error) {
    log.error('mfa skip failed', error, {
      operation: 'mfa_skip',
      duration: Date.now() - startTime,
      correlationId: correlation.current(),
      component: 'auth',
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

export const POST = publicRoute(handler, 'MFA skip endpoint', { rateLimit: 'auth' });
