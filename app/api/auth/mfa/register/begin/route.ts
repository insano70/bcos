/**
 * POST /api/auth/mfa/register/begin
 * Begin passkey registration flow
 *
 * Authentication: Requires temp token OR full access token
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
    // Extract IP and user agent
    const ipAddress =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    const userAgent = request.headers.get('user-agent') || null;

    // Try full auth first, fall back to temp token
    let userId: string;
    let userEmail: string;
    let userName: string;

    try {
      const session = await requireAuth(request);
      userId = session.user.id;
      userEmail = session.user.email || '';
      userName = session.user.name;
    } catch {
      // Fall back to temp token
      const tempPayload = await requireMFATempToken(request);
      userId = tempPayload.sub;

      // Fetch user details
      const [user] = await db.select().from(users).where(eq(users.user_id, userId)).limit(1);

      if (!user) {
        throw AuthenticationError('User not found');
      }

      userEmail = user.email;
      userName = `${user.first_name} ${user.last_name}`;
    }

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
