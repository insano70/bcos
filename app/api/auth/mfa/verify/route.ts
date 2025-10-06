/**
 * POST /api/auth/mfa/verify
 * Verify passkey and complete MFA authentication
 *
 * Authentication: Requires temp token (from login)
 * Returns: Full access + refresh tokens
 */

import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse, AuthenticationError } from '@/lib/api/responses/error';
import { publicRoute } from '@/lib/api/route-handler';
import { requireMFATempToken } from '@/lib/auth/webauthn-temp-token';
import { completeAuthentication } from '@/lib/auth/webauthn';
import { createTokenPair, generateDeviceFingerprint, generateDeviceName } from '@/lib/auth/token-manager';
import { getCachedUserContextSafe } from '@/lib/rbac/cached-user-context';
import { setCSRFToken } from '@/lib/security/csrf-unified';
import { db, users } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { log } from '@/lib/logger';
import type { AuthenticationCompleteRequest, AuthenticationCompleteResponse } from '@/lib/types/webauthn';

export const dynamic = 'force-dynamic';

const handler = async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    // Extract IP and user agent
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    const userAgent = request.headers.get('user-agent') || null;

    // Parse request body
    const body = (await request.json()) as AuthenticationCompleteRequest;
    const { assertion, challenge_id } = body;

    if (!assertion || !challenge_id) {
      throw new Error('Missing required fields: assertion, challenge_id');
    }

    // Validate temp token
    const tempPayload = await requireMFATempToken(request);
    const userId = tempPayload.sub;

    // Verify passkey assertion
    const verificationResult = await completeAuthentication({
      userId,
      challengeId: challenge_id,
      assertion,
      ipAddress,
      userAgent,
    });

    if (!verificationResult.success) {
      throw AuthenticationError(verificationResult.error || 'Passkey verification failed');
    }

    // Fetch user details
    const [user] = await db.select().from(users).where(eq(users.user_id, userId)).limit(1);

    if (!user || !user.is_active) {
      throw AuthenticationError('User account is inactive');
    }

    // Generate device info
    const deviceFingerprint = generateDeviceFingerprint(ipAddress, userAgent || 'unknown');
    const deviceName = generateDeviceName(userAgent || 'unknown');

    const deviceInfo = {
      ipAddress,
      userAgent: userAgent || 'unknown',
      fingerprint: deviceFingerprint,
      deviceName,
    };

    // Create full token pair
    const tokenPair = await createTokenPair(user.user_id, deviceInfo, false, user.email);

    // Set secure httpOnly cookies
    const cookieStore = await cookies();
    const isSecureEnvironment = process.env.NODE_ENV === 'production';
    const maxAge = 7 * 24 * 60 * 60; // 7 days

    cookieStore.set('refresh-token', tokenPair.refreshToken, {
      httpOnly: true,
      secure: isSecureEnvironment,
      sameSite: 'strict',
      path: '/',
      maxAge,
    });

    cookieStore.set('access-token', tokenPair.accessToken, {
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

    const totalDuration = Date.now() - startTime;
    log.api('POST /api/auth/mfa/verify - Success', request, 200, totalDuration);

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
    const totalDuration = Date.now() - startTime;
    log.error('Passkey verification failed', {
      error: error instanceof Error ? error.message : String(error),
      duration: totalDuration,
    });

    log.api('POST /api/auth/mfa/verify - Error', request, 500, totalDuration);

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

export const POST = publicRoute(handler, 'MFA verification', { rateLimit: 'auth' });
