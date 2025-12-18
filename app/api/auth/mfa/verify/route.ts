/**
 * POST /api/auth/mfa/verify
 * Verify passkey and complete MFA authentication
 *
 * Authentication: Requires temp token (from login)
 * Returns: Full access + refresh tokens
 */

import type { NextRequest } from 'next/server';
import { AuthenticationError, handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { publicRoute } from '@/lib/api/route-handlers';
import { requireMFATempToken } from '@/lib/auth/webauthn-temp-token';
import { log, SLOW_THRESHOLDS } from '@/lib/logger';
import type {
  AuthenticationCompleteRequest,
  AuthenticationCompleteResponse,
} from '@/lib/types/webauthn';
import { completePasskeyVerification } from '@/lib/services/auth/mfa-service';
import { setupSessionWithCookies } from '@/lib/services/auth/session-manager-service';
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

    // Set up full session with cookies using consolidated utility
    const sessionResult = await setupSessionWithCookies({
      userId: user.user_id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      emailVerified: user.email_verified,
      ipAddress,
      userAgent,
      rememberMe: false,
      authMethod: 'temp_token',
    });

    const duration = Date.now() - startTime;

    log.info('mfa verification successful - passkey validated and session created', {
      operation: 'mfa_verify',
      userId: user.user_id,
      email: user.email,
      sessionId: sessionResult.tokenPair.sessionId,
      credentialId: verificationResult.credentialId?.substring(0, 16),
      authMethod: 'temp_token',
      rbac: {
        roles: sessionResult.user.roles.length,
        primaryRole: sessionResult.user.role,
        permissions: sessionResult.user.permissions.length,
      },
      session: {
        rememberMe: false,
        maxAge: sessionResult.maxAge,
        sessionId: sessionResult.tokenPair.sessionId,
      },
      device: {
        name: sessionResult.deviceName,
        fingerprint: sessionResult.deviceFingerprint,
      },
      duration,
      slow: duration > SLOW_THRESHOLDS.AUTH_OPERATION,
      ipAddress,
      component: 'auth',
    });

    const response: AuthenticationCompleteResponse = {
      success: true,
      accessToken: sessionResult.tokenPair.accessToken,
      refreshToken: sessionResult.tokenPair.refreshToken,
      sessionId: sessionResult.tokenPair.sessionId,
      expiresAt: sessionResult.tokenPair.expiresAt.toISOString(),
    };

    return createSuccessResponse(
      {
        ...response,
        user: sessionResult.user,
        csrfToken: sessionResult.csrfToken,
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

    return handleRouteError(error, 'Passkey verification failed', request);
  }
};

export const POST = publicRoute(handler, 'MFA verification', { rateLimit: 'auth' });
