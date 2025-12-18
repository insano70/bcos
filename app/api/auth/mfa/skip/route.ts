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

import type { NextRequest } from 'next/server';
import { handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { publicRoute } from '@/lib/api/route-handlers';
import { requireMFATempToken } from '@/lib/auth/webauthn-temp-token';
import { correlation, log } from '@/lib/logger';
import { recordMFASkip } from '@/lib/services/auth/mfa-service';
import { setupSessionWithCookies } from '@/lib/services/auth/session-manager-service';
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

    // Set up full session with cookies using consolidated utility
    const sessionResult = await setupSessionWithCookies({
      userId: user.user_id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      emailVerified: user.email_verified,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      rememberMe: false,
      authMethod: 'mfa_skip',
    });

    const duration = Date.now() - startTime;
    log.info('mfa setup skipped - session created', {
      operation: 'mfa_skip',
      userId: user.user_id,
      skipsRemaining: skipResult.skipsRemaining,
      sessionCreated: true,
      sessionId: sessionResult.tokenPair.sessionId,
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
        accessToken: sessionResult.tokenPair.accessToken,
        sessionId: sessionResult.tokenPair.sessionId,
        expiresAt: sessionResult.tokenPair.expiresAt.toISOString(),
        skipsRemaining: skipResult.skipsRemaining,
        user: sessionResult.user,
        csrfToken: sessionResult.csrfToken,
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

    return handleRouteError(error, 'MFA skip failed', request);
  }
};

export const POST = publicRoute(handler, 'MFA skip endpoint', { rateLimit: 'auth' });
