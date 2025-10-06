/**
 * POST /api/auth/mfa/register/begin
 * Begin passkey registration flow
 *
 * Authentication: Supports both temp token (first-time setup) and full session (adding passkeys)
 * Security: User must have validated credentials (temp token or session)
 */

import type { NextRequest } from 'next/server';
import { createSuccessResponse } from '@/lib/api/responses/success';
import { createErrorResponse, AuthenticationError } from '@/lib/api/responses/error';
import { publicRoute } from '@/lib/api/route-handler';
import { requireAuth } from '@/lib/api/middleware/auth';
import { requireMFATempToken } from '@/lib/auth/webauthn-temp-token';
import { beginRegistration } from '@/lib/auth/webauthn';
import { db, users } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { log } from '@/lib/logger';
import type { RegistrationBeginResponse } from '@/lib/types/webauthn';

export const dynamic = 'force-dynamic';

const handler = async (request: NextRequest) => {
  try {
    let userId: string;
    let userEmail: string;
    let userName: string;

    // Try full authentication first (for users adding additional passkeys)
    try {
      const session = await requireAuth(request);
      userId = session.user.id;
      userEmail = session.user.email || '';
      userName = session.user.name;

      log.debug('MFA registration begin - using full session', { userId });
    } catch {
      // Fall back to temp token (for first-time MFA setup during login)
      const tempPayload = await requireMFATempToken(request);
      userId = tempPayload.sub;

      // Fetch user details from database
      const [user] = await db.select().from(users).where(eq(users.user_id, userId)).limit(1);

      if (!user) {
        throw AuthenticationError('User not found');
      }

      userEmail = user.email;
      userName = `${user.first_name} ${user.last_name}`;

      log.debug('MFA registration begin - using temp token', { userId });
    }

    // Extract IP and user agent
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    const userAgent = request.headers.get('user-agent') || null;

    // Generate registration options
    const { options, challenge_id } = await beginRegistration(
      userId,
      userEmail,
      userName,
      ipAddress,
      userAgent
    );

    log.info('Passkey registration begin', {
      userId,
      challengeId: challenge_id.substring(0, 8),
    });

    const response: RegistrationBeginResponse = {
      options,
      challenge_id,
    };

    return createSuccessResponse(response, 'Passkey registration challenge generated');
  } catch (error) {
    log.error('Passkey registration begin failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    return createErrorResponse(error instanceof Error ? error : 'Unknown error', 500, request);
  }
};

export const POST = publicRoute(handler, 'MFA registration begin', { rateLimit: 'auth' });
