/**
 * POST /api/auth/mfa/register/begin
 * Begin passkey registration flow
 *
 * Authentication: Supports both temp token (first-time setup) and full session (adding passkeys)
 * Security: User must have validated credentials (temp token or session)
 */

import type { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/api/middleware/auth';
import { AuthenticationError, handleRouteError } from '@/lib/api/responses/error';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { publicRoute } from '@/lib/api/route-handlers';
import { requireMFATempToken } from '@/lib/auth/webauthn-temp-token';
import { log } from '@/lib/logger';
import type { RegistrationBeginResponse } from '@/lib/types/webauthn';
import { beginPasskeyRegistration } from '@/lib/services/auth/mfa-service';
import { getUserById } from '@/lib/services/auth/user-lookup-service';

export const dynamic = 'force-dynamic';

const handler = async (request: NextRequest) => {
  const startTime = Date.now();

  try {
    let userId: string;
    let userEmail: string;
    let userName: string;
    let authMethod: 'session' | 'temp_token';

    // Try full authentication first (for users adding additional passkeys)
    try {
      const session = await requireAuth(request);
      userId = session.user.id;
      userEmail = session.user.email || '';
      userName = session.user.name;
      authMethod = 'session';
    } catch {
      // Fall back to temp token (for first-time MFA setup during login)
      const tempPayload = await requireMFATempToken(request);
      userId = tempPayload.sub;

      // Use service layer for user lookup
      const user = await getUserById(userId);

      if (!user) {
        throw AuthenticationError('User not found');
      }

      userEmail = user.email;
      userName = `${user.first_name} ${user.last_name}`;
      authMethod = 'temp_token';
    }

    const { extractRequestMetadata } = await import('@/lib/api/utils/request');
    const metadata = extractRequestMetadata(request);

    // Use service layer for registration
    const { options, challenge_id } = await beginPasskeyRegistration({
      userId,
      userEmail,
      userName,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    const duration = Date.now() - startTime;
    log.info('mfa registration challenge generated', {
      operation: 'mfa_register_begin',
      userId,
      authMethod,
      challengeId: challenge_id.substring(0, 8),
      duration,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      component: 'auth',
    });

    const response: RegistrationBeginResponse = {
      options,
      challenge_id,
    };

    return createSuccessResponse(response, 'Passkey registration challenge generated');
  } catch (error) {
    log.error('mfa registration begin failed', error, {
      operation: 'mfa_register_begin',
      duration: Date.now() - startTime,
      component: 'auth',
    });

    return handleRouteError(error, 'Passkey registration begin failed', request);
  }
};

export const POST = publicRoute(handler, 'MFA registration begin', { rateLimit: 'auth' });
