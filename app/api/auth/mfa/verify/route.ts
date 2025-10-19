/**
 * POST /api/auth/mfa/verify
 * Verify passkey and complete MFA authentication
 *
 * Authentication: Requires temp token (from login)
 * Returns: Full access + refresh tokens
 */

import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { AuthenticationError, createErrorResponse } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { publicRoute } from '@/lib/api/route-handlers';
import { COOKIE_NAMES } from '@/lib/auth/cookie-names';
import { requireMFATempToken } from '@/lib/auth/webauthn-temp-token';
import { log } from '@/lib/logger';
import { getCachedUserContextSafe } from '@/lib/rbac/cached-user-context';
import { setCSRFToken } from '@/lib/security/csrf-unified';
import type {
  AuthenticationCompleteRequest,
  AuthenticationCompleteResponse,
} from '@/lib/types/webauthn';
import { completePasskeyVerification } from '@/lib/services/auth/mfa-service';
import { createAuthSession } from '@/lib/services/auth/session-manager-service';
import { getUserById } from '@/lib/services/auth/user-lookup-service';

export const dynamic = 'force-dynamic';

const handler = async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    // Rate limit already applied by publicRoute wrapper - no need to apply here

    // Extract IP and user agent
    const { extractRequestMetadata } = await import('@/lib/api/utils/request');
    const metadata = extractRequestMetadata(request);
    const ipAddress = metadata.ipAddress;
    const userAgent = metadata.userAgent;

    // Parse request body
    const body = (await request.json()) as AuthenticationCompleteRequest;
    const { assertion, challenge_id } = body;

    if (!assertion || !challenge_id) {
      throw new Error('Missing required fields: assertion, challenge_id');
    }

    // Validate temp token
    const tempPayload = await requireMFATempToken(request);
    const userId = tempPayload.sub;

    // Verify passkey assertion using service layer
    const verificationResult = await completePasskeyVerification({
      userId,
      challengeId: challenge_id,
      assertion,
      ipAddress,
      userAgent,
    });

    if (!verificationResult.success) {
      throw AuthenticationError(verificationResult.error || 'Passkey verification failed');
    }

    // Fetch user details using service layer
    const user = await getUserById(userId);

    if (!user || !user.is_active) {
      throw AuthenticationError('User account is inactive');
    }

    // Build device info for session creation
    const { generateDeviceFingerprint, generateDeviceName } = await import(
      '@/lib/auth/token-manager'
    );
    const deviceFingerprint = generateDeviceFingerprint(ipAddress, userAgent || 'unknown');
    const deviceName = generateDeviceName(userAgent || 'unknown');

    const deviceInfo = {
      ipAddress,
      userAgent: userAgent || 'unknown',
      fingerprint: deviceFingerprint,
      deviceName,
    };

    // Create full session using service layer
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

    // Get user context
    const userContext = await getCachedUserContextSafe(user.user_id);
    const userRoles = userContext?.roles?.map((r) => r.name) || [];
    const primaryRole = userRoles.length > 0 ? userRoles[0] : 'user';

    // Generate CSRF token
    const csrfToken = await setCSRFToken(user.user_id);

    const duration = Date.now() - startTime;

    log.info('mfa verification successful - passkey validated and session created', {
      operation: 'mfa_verify',
      userId: user.user_id,
      email: user.email,
      sessionId: tokenPair.sessionId,
      credentialId: verificationResult.credentialId?.substring(0, 16),
      authMethod: 'temp_token',
      rbac: {
        roles: userRoles.length,
        primaryRole,
        permissions: userContext?.all_permissions?.length || 0,
      },
      session: {
        rememberMe: false,
        maxAge: maxAge,
        sessionId: tokenPair.sessionId,
      },
      device: {
        name: deviceName,
        fingerprint: deviceFingerprint.substring(0, 8),
      },
      duration,
      slow: duration > 2000,
      ipAddress,
      component: 'auth',
    });

    const response: AuthenticationCompleteResponse = {
      success: true,
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      sessionId: tokenPair.sessionId,
      expiresAt: tokenPair.expiresAt.toISOString(),
    };

    return createSuccessResponse(
      {
        ...response,
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
      'Passkey verification successful'
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    log.error('Passkey verification failed', error, {
      operation: 'mfa_verify',
      duration,
      component: 'auth',
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

export const POST = publicRoute(handler, 'MFA verification', { rateLimit: 'auth' });
